/**
 * Recipe: one base profile + dose, temperature and ratio chosen per shot.
 *
 * Instead of keeping one saved copy of a profile per temperature/yield, the
 * base profile is cloned with the chosen temperature and final weight
 * (dose × ratio) and loaded with POST /profile/load, which runs it without
 * saving anything on the machine.
 */

import type { Profile } from "./types";

export interface Recipe {
  baseProfileId: string | null;
  dose: number;        // g of ground coffee
  temperature: number; // °C
  ratio: number;       // beverage = dose × ratio
  coffee?: string;     // beans in use (free text)
  grinder?: string;    // grinder model, e.g. "Motto 80"
  grindUm?: number;    // grind setting in microns
  feed?: number;       // feed rate (Motto 80: 10-65)
  rpm?: number;        // burr speed (Motto 80: 500-1500; optional on other grinders)
  grindSetting?: number; // dial setting on grinders without microns (e.g. 2.5)
  /** Legacy free-text grind (older versions) */
  grind?: string;
}

/** Defaults for the user's grinder (Timemore Motto 80 style controls). */
export const GRINDER_DEFAULTS = { grinder: "Motto 80", grindUm: 150, feed: 65, rpm: 1000 };

const RECENT_BEANS_KEY = "metbarista_recent_beans";

/** Beans used, most recent first (up to 50: frozen coffees can wait weeks between shots). */
export function recentBeans(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_BEANS_KEY) ?? "[]") as string[]; } catch { return []; }
}

export function rememberBeans(name: string | undefined): void {
  const n = name?.trim();
  if (!n) return;
  const list = [n, ...recentBeans().filter((b) => b.toLowerCase() !== n.toLowerCase())].slice(0, 50);
  localStorage.setItem(RECENT_BEANS_KEY, JSON.stringify(list));
}

export type GrinderFields = Pick<Recipe, "grinder" | "grindUm" | "feed" | "rpm" | "grindSetting">;

/** The Motto 80 has microns, feed and rpm; most grinders only a dial setting (and maybe rpm). */
export function isMotto80(name: string | undefined): boolean {
  return /motto\s*80/i.test(name ?? GRINDER_DEFAULTS.grinder);
}

/** Grinder settings that apply to the chosen grinder, with the Motto 80 defaults filled in. */
export function grinderFields(r: Partial<Recipe>): GrinderFields {
  const grinder = (r.grinder ?? GRINDER_DEFAULTS.grinder).trim();
  if (isMotto80(grinder)) {
    return {
      grinder,
      grindUm: r.grindUm ?? GRINDER_DEFAULTS.grindUm,
      feed: r.feed ?? GRINDER_DEFAULTS.feed,
      rpm: r.rpm ?? GRINDER_DEFAULTS.rpm,
    };
  }
  return { grinder, grindSetting: r.grindSetting, rpm: r.rpm };
}

/** "Motto 80 150µm feed 65 1000rpm" or "EK43 grind 9.5 1200rpm" */
export function grindText(r: Partial<Recipe>): string {
  const g = r.grinder != null || r.grindUm != null || r.grindSetting != null ? grinderFields(r) : null;
  if (!g) return r.grind?.trim() ?? "";
  const parts = [
    g.grinder,
    g.grindUm != null ? `${g.grindUm}µm` : "",
    g.grindSetting != null ? `grind ${g.grindSetting}` : "",
    g.feed != null ? `feed ${g.feed}` : "",
    g.rpm != null ? `${g.rpm}rpm` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

const RECENT_GRINDERS_KEY = "metbarista_recent_grinders";

/** Grinders used (most recent first) with their last settings; the Motto 80 is always there. */
export function recentGrinders(): GrinderFields[] {
  let list: GrinderFields[] = [];
  try { list = JSON.parse(localStorage.getItem(RECENT_GRINDERS_KEY) ?? "[]") as GrinderFields[]; } catch { /* empty */ }
  if (!list.some((g) => isMotto80(g.grinder))) list.push(grinderFields({ grinder: GRINDER_DEFAULTS.grinder }));
  return list;
}

export function rememberGrinder(r: Partial<Recipe>): void {
  const g = grinderFields(r);
  if (!g.grinder) return;
  const list = [g, ...recentGrinders().filter((x) => x.grinder?.toLowerCase() !== g.grinder?.toLowerCase())].slice(0, 10);
  localStorage.setItem(RECENT_GRINDERS_KEY, JSON.stringify(list));
}

/**
 * Coffee and grind travel with the shot inside the loaded profile, so the
 * machine's shot history keeps them on every device. Stored in
 * display.shortDescription as "Coffee: … · Grind: …".
 */
export function shotNotesText(r: Partial<Recipe>): string {
  // Plain ASCII: the machine garbles accents and symbols ("·", "°", "µ") in what it stores
  const parts = [];
  if (r.coffee?.trim()) parts.push(`Coffee: ${asciiName(r.coffee)}`);
  const g = grindText(r);
  if (g) parts.push(`Grind: ${asciiName(g.replace(/µm/g, "um"))}`);
  return parts.join(" | ");
}

/** Reads coffee/grind back from a shot's profile (see shotNotesText; older shots used "·"). */
export function parseShotNotes(text: string | undefined | null): { coffee?: string; grind?: string } {
  if (!text) return {};
  const coffee = /Coffee: ([^·|]+?)(?: [·|]|$)/.exec(text)?.[1]?.trim();
  const grind = /Grind: ([^·|]+?)(?: [·|]|$)/.exec(text)?.[1]?.trim().replace(/(\d)um(?![a-z])/g, "$1µm");
  return { coffee, grind };
}

// ── Piston retraction (how much water the piston draws) ──
// Same conversion and range as Meticulous's web UI and Dial (src/lib/retraction.ts):
// the machine stores piston travel in mm; people think in ml of water.
const PISTON_AREA_MM2 = Math.PI * 26.5 * 26.5;
export const RETRACTION_MIN_ML = 80;
export const RETRACTION_MAX_ML = 150;
export const retractionMmToMl = (mm: number) => Math.round((PISTON_AREA_MM2 * mm) / 1000);
export const retractionMlToMm = (ml: number) => Math.round((ml * 1000 * 100) / PISTON_AREA_MM2) / 100;

/**
 * Largest yield the machine can give with this dose: the most water the piston
 * draws (150 ml), minus what the puck keeps and the safety margin.
 */
export function maxYieldFor(dose: number): number {
  return Math.min(MAX_FINAL_WEIGHT, Math.floor(RETRACTION_MAX_ML - 1.25 * dose - 10));
}

/** The official profile editor caps the final weight at 100 g: the Station does too */
export const MAX_FINAL_WEIGHT = 100;

/** The recipe asks for more coffee than one piston of water can give */
export function overCapacity(r: Pick<Recipe, "dose" | "ratio">): boolean {
  return r.dose * r.ratio > maxYieldFor(r.dose);
}

/**
 * Water to draw for this recipe: the yield, plus what the puck keeps
 * (~1.25 × dose: 100 ml used to give ~75 g with 20 g), plus 10 ml of margin.
 * Less water for short shots = less air in the chamber (no "pop" at the end).
 */
export function retractionFor(r: Pick<Recipe, "dose" | "ratio">): number {
  const ml = Math.ceil(Math.min(MAX_FINAL_WEIGHT, r.dose * r.ratio) + 1.25 * r.dose + 10);
  return Math.min(RETRACTION_MAX_ML, Math.max(RETRACTION_MIN_ML, ml));
}

// ── Refractometer (DiFluid etc.) ──

/** Extraction yield (%) = TDS (%) × beverage (g) ÷ dose (g), one decimal */
export function extractionYield(tds: number, beverageG: number, doseG: number): number | null {
  if (!(tds > 0) || !(beverageG > 0) || !(doseG > 0)) return null;
  return Math.round(((tds * beverageG) / doseG) * 10) / 10;
}

/** "TDS 9.50% · EY 23.8%" (kept in the shot's notes) */
export function tdsText(tds: number, ey: number | null): string {
  return `TDS ${tds.toFixed(2)}%${ey != null ? ` · EY ${ey.toFixed(1)}%` : ""}`;
}

/** Reads TDS / EY back from a shot's notes */
export function parseTds(note: string | undefined | null): { tds?: number; ey?: number } {
  const tds = note ? /TDS ([\d.]+)%/.exec(note)?.[1] : undefined;
  const ey = note ? /EY ([\d.]+)%/.exec(note)?.[1] : undefined;
  return { ...(tds ? { tds: Number(tds) } : {}), ...(ey ? { ey: Number(ey) } : {}) };
}

export const DEFAULT_RECIPE: Recipe = {
  baseProfileId: null,
  dose: 20,
  temperature: 94,
  ratio: 2,
};

export const LIMITS = {
  dose: { min: 5, max: 30, step: 0.5 },
  temperature: { min: 70, max: 100, step: 0.5 },
  ratio: { min: 1, max: 10, step: 0.1 },
} as const;

/** The ratios on the wheel (the user's shortcuts). */
export const RATIO_PRESETS = [1, 1.5, 1.8, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];

const STORAGE_KEY = "metbarista_recipe";

export function loadRecipe(): Recipe {
  if (typeof window === "undefined") return DEFAULT_RECIPE;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Recipe> | null;
    return { ...DEFAULT_RECIPE, ...(saved ?? {}) };
  } catch {
    return DEFAULT_RECIPE;
  }
}

export function saveRecipe(r: Recipe): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
}

/** Rounds away float noise from repeated +/- steps (e.g. 2.3000000004). */
export function roundTo(value: number, step: number): number {
  const decimals = step < 1 ? String(step).split(".")[1].length : 0;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export function beverageWeight(r: Recipe): number {
  return roundTo(r.dose * r.ratio, 0.1);
}

export function formatRatio(ratio: number): string {
  return `1:${ratio.toFixed(1).replace(/\.0$/, "")}`;
}

/**
 * Sorts profiles like the dial does: by the machine's "Profile order" setting,
 * then any profile missing from it by name.
 */
export function sortByMachineOrder(profiles: Profile[], order: string[] | undefined): Profile[] {
  const rank = new Map((order ?? []).map((id, i) => [id, i]));
  return [...profiles].sort((a, b) => {
    const ra = rank.get(a.id) ?? Infinity;
    const rb = rank.get(b.id) ?? Infinity;
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });
}

/** Damian's LRv2 as imported on this machine (it may have been renamed). */
const LRV2_ID = "07c4eec6-caf1-410a-b3f5-40d437304567";

/**
 * Picks the default base profile: the last one used, else Damian's LRv2 (by id,
 * then by name), else any profile by Damian, else the first one.
 */
export function pickBaseProfile(profiles: Profile[], savedId: string | null): Profile | null {
  return (
    profiles.find((p) => p.id === savedId) ??
    profiles.find((p) => p.id === LRV2_ID) ??
    profiles.find((p) => /lrv2/i.test(p.name)) ??
    profiles.find((p) => /damian/i.test(p.author ?? "")) ??
    profiles[0] ??
    null
  );
}

/** Plain ASCII for the machine's name field: "Etiópia" → "Etiopia", no µ ° · */
export function asciiName(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim();
}

/** " - Etiopia Guji 150um" (or " - Guji grind 2.5" on other grinders): coffee and grind in the shot's name */
function nameTag(r: Partial<Recipe>): string {
  const coffee = r.coffee ? asciiName(r.coffee) : "";
  if (!coffee) return "";
  const g = grinderFields(r);
  const grind = g.grindUm != null ? ` ${g.grindUm}um` : g.grindSetting != null ? ` grind ${g.grindSetting}` : "";
  return ` - ${coffee}${grind}`;
}

/** Recipe part of a shot name: "Base - 20g 1:2.5 94C - Etiopia Guji 150um" */
export const SHOT_NAME_RE = / - ([\d.]+)g 1:([\d.]+) ([\d.]+)C(?: - (.+?)(?: (\d+)um| grind ([\d.]+))?)?$/;

/** Profile name without the recipe and coffee added by the Station */
export function baseName(name: string): string {
  return name.replace(SHOT_NAME_RE, "");
}

/** Copy of the base profile with this shot's temperature and yield. */
export function buildShotProfile(base: Profile, r: Recipe): Profile {
  const copy: Profile = structuredClone(base);
  copy.temperature = r.temperature;
  copy.final_weight = Math.min(MAX_FINAL_WEIGHT, beverageWeight(r));
  // Plain ASCII: the dial's font may not have "·" or "°"
  copy.name = `${base.name} - ${r.dose}g ${formatRatio(r.ratio)} ${r.temperature}C${nameTag(r)}`;
  const notes = shotNotesText(r);
  if (notes) copy.display = { ...(copy.display ?? {}), shortDescription: notes };
  // Fields that describe the saved file, not the shot
  delete copy.isLast;
  delete copy.last_changed;
  return copy;
}
