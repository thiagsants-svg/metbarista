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
  feed?: number;       // feed rate (Motto 80: up to 65)
  rpm?: number;        // burr speed (Motto 80: 300-1500)
  /** Legacy free-text grind (older versions) */
  grind?: string;
}

/** Defaults for the user's grinder (Timemore Motto 80 style controls). */
export const GRINDER_DEFAULTS = { grinder: "Motto 80", grindUm: 140, feed: 65, rpm: 1000 };

const RECENT_BEANS_KEY = "metbarista_recent_beans";

/** Last beans used (most recent first), for quick picking. */
export function recentBeans(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_BEANS_KEY) ?? "[]") as string[]; } catch { return []; }
}

export function rememberBeans(name: string | undefined): void {
  const n = name?.trim();
  if (!n) return;
  const list = [n, ...recentBeans().filter((b) => b.toLowerCase() !== n.toLowerCase())].slice(0, 10);
  localStorage.setItem(RECENT_BEANS_KEY, JSON.stringify(list));
}

/** "Motto 80 140µm feed 65 1000rpm" */
export function grindText(r: Pick<Recipe, "grinder" | "grindUm" | "feed" | "rpm" | "grind">): string {
  const parts = [r.grinder?.trim(), r.grindUm ? `${r.grindUm}µm` : "", r.feed ? `feed ${r.feed}` : "", r.rpm ? `${r.rpm}rpm` : ""]
    .filter(Boolean);
  return parts.length ? parts.join(" ") : (r.grind?.trim() ?? "");
}

/**
 * Coffee and grind travel with the shot inside the loaded profile, so the
 * machine's shot history keeps them on every device. Stored in
 * display.shortDescription as "Coffee: … · Grind: …".
 */
export function shotNotesText(r: Pick<Recipe, "coffee" | "grind" | "grinder" | "grindUm" | "feed" | "rpm">): string {
  const parts = [];
  if (r.coffee?.trim()) parts.push(`Coffee: ${r.coffee.trim()}`);
  const g = grindText(r);
  if (g) parts.push(`Grind: ${g}`);
  return parts.join(" · ");
}

/** Reads coffee/grind back from a shot's profile (see shotNotesText). */
export function parseShotNotes(text: string | undefined | null): { coffee?: string; grind?: string } {
  if (!text) return {};
  const coffee = /Coffee: ([^·]+?)(?: ·|$)/.exec(text)?.[1]?.trim();
  const grind = /Grind: ([^·]+?)(?: ·|$)/.exec(text)?.[1]?.trim();
  return { coffee, grind };
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
  ratio: { min: 1, max: 5, step: 0.1 },
} as const;

/** One-tap ratios; the stepper refines in 0.1 steps. */
export const RATIO_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5];

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

/** Copy of the base profile with this shot's temperature and yield. */
export function buildShotProfile(base: Profile, r: Recipe): Profile {
  const copy: Profile = structuredClone(base);
  copy.temperature = r.temperature;
  copy.final_weight = beverageWeight(r);
  // Plain ASCII: the dial's font may not have "·" or "°"
  copy.name = `${base.name} - ${r.dose}g ${formatRatio(r.ratio)} ${r.temperature}C`;
  const notes = shotNotesText(r);
  if (notes) copy.display = { ...(copy.display ?? {}), shortDescription: notes };
  // Fields that describe the saved file, not the shot
  delete copy.isLast;
  delete copy.last_changed;
  return copy;
}
