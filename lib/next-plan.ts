/**
 * "What I'll change next time": decided right after tasting a shot, kept per
 * coffee on this device, and applied when that coffee is picked again.
 *
 * Temperature and ratio are chosen on the same wheels as the recipe and are
 * applied to it; grind is only a suggestion (the grinder is set by hand).
 */

import { asciiName, formatRatio, type Recipe } from "./recipe";

export type Taste = "sour" | "balanced" | "bitter";
/** Which way to move the grinder next time; how much is up to you */
export type GrindDir = "finer" | "coarser";

export interface NextPlan {
  coffee: string;
  /** How the shot tasted (on the compass); absent when only the next recipe was set */
  taste?: Taste;
  /** Absolute values for the next shot (absent = unchanged) */
  temperature?: number;
  ratio?: number;
  /** Grind finer or coarser next time (no amount: the grinder is set by hand) */
  grind?: GrindDir;
  /** The grind the tasted shot was made at ("140 µm"), so next time shows where you started */
  grindWas?: string;
  /** Older plans: a set grind change, µm on the Motto 80, dial steps otherwise (negative = finer) */
  grindDelta?: number;
  /** Where the taste was tapped on the compass (-1…1 each way): how sour or bitter, not only which side */
  point?: { x: number; y: number };
  /** ms: when it was decided */
  at: number;
}

export const TASTE_LABEL: Record<Taste, string> = { sour: "Sour", balanced: "Balanced", bitter: "Bitter" };

function isDial(r: Partial<Recipe>): boolean {
  return r.grindSetting != null && r.grindUm == null;
}

/** The grind a shot was made at ("140 µm", "2.5" on a dial), or null if none was recorded */
export function grindNow(r: Partial<Recipe>): string | null {
  if (r.grindUm != null) return `${r.grindUm} µm`;
  if (r.grindSetting != null) return String(r.grindSetting);
  return null;
}

export function grindLabel(delta: number, r: Partial<Recipe>): string {
  const unit = isDial(r) ? "" : " µm";
  return `${Math.abs(delta)}${unit} ${delta < 0 ? "finer" : "coarser"}`;
}

/** Grind the suggestion points to ("130 µm", "grind 2"), or null */
export function grindTarget(r: Partial<Recipe>, delta: number | undefined): string | null {
  if (!delta) return null;
  if (r.grindUm != null) return `${Math.max(0, r.grindUm + delta)} µm`;
  if (r.grindSetting != null) return `grind ${Math.max(0, Math.round((r.grindSetting + delta) * 10) / 10)}`;
  return null;
}

/** Recipe for the next shot: temperature and ratio from the plan; grind stays as it is */
export function applyPlan(base: Partial<Recipe>, plan: Pick<NextPlan, "temperature" | "ratio">): Partial<Recipe> {
  return {
    ...base,
    ...(plan.temperature != null ? { temperature: plan.temperature } : {}),
    ...(plan.ratio != null ? { ratio: plan.ratio } : {}),
  };
}

/** Lines describing the plan against the last shot ("94 → 95 °C", "1:2.5 → 1:3", "Grind finer than 140 µm") */
export function planLines(base: Partial<Recipe>, plan: Omit<NextPlan, "coffee" | "at">): string[] {
  const out: string[] = [];
  if (plan.temperature != null && plan.temperature !== base.temperature) out.push(`${base.temperature ?? "?"} → ${plan.temperature} °C`);
  if (plan.ratio != null && plan.ratio !== base.ratio) out.push(`${base.ratio != null ? formatRatio(base.ratio) : "?"} → ${formatRatio(plan.ratio)}`);
  if (plan.grind) {
    const now = plan.grindWas ?? grindNow(base);
    out.push(`Grind ${plan.grind}${now ? ` than ${now}` : ""}`);
  } else if (plan.grindDelta) {
    const target = grindTarget(base, plan.grindDelta);
    out.push(`${grindLabel(plan.grindDelta, base)}${target ? ` → ${target}` : ""}`);
  }
  return out;
}

// ── Storage, per coffee (this device) ──

const KEY = "metbarista_next_plans";
const keyOf = (coffee: string) => asciiName(coffee).toLowerCase();

function readAll(): Record<string, NextPlan> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, NextPlan>; } catch { return {}; }
}

export function savePlan(plan: NextPlan): void {
  if (!plan.coffee.trim()) return;
  const all = readAll();
  all[keyOf(plan.coffee)] = plan;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full */ }
}

export function loadPlan(coffee: string | undefined): NextPlan | null {
  if (!coffee?.trim()) return null;
  return readAll()[keyOf(coffee)] ?? null;
}

/** The plan was used: a new shot of that coffee started */
export function clearPlan(coffee: string | undefined): void {
  if (!coffee?.trim()) return;
  const all = readAll();
  delete all[keyOf(coffee)];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
