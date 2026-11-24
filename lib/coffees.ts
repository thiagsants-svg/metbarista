/**
 * The coffee shelf, on this device: every coffee you have, with a few details,
 * where it is (in use, in the freezer, finished) and bag photos (kept apart,
 * see coffee-photos.ts). Coffees brewed on the Station appear here by
 * themselves; finished ones leave the Station's list but keep their shots.
 *
 * Two ways to freeze: single doses (brewed straight from the freezer, so the
 * coffee stays on the Station's list and each shot uses one dose) or the whole
 * bag (off the list until it's thawed; then it's in use, with the thaw date).
 */

import { asciiName, recentBeans } from "./recipe";

const RECENT_BEANS_KEY = "metbarista_recent_beans";

export type CoffeeStatus = "open" | "frozen" | "finished";

export const STATUS_LABEL: Record<CoffeeStatus, string> = {
  open: "In use",
  frozen: "Frozen",
  finished: "Finished",
};

export type FreezeMode = "doses" | "bag";

export const FREEZE_LABEL: Record<FreezeMode, string> = { doses: "Single doses", bag: "Whole bag" };

export interface Coffee {
  /** asciiName, lower case: how shots and plans find the coffee */
  key: string;
  name: string;
  roaster?: string;
  /** Origin, process, tasting notes on the bag… */
  notes?: string;
  status: CoffeeStatus;
  /** How it's frozen (while status is "frozen") */
  freezeMode?: FreezeMode;
  /** Single doses left in the freezer */
  doses?: number;
  /** ms: when it went into the freezer / came out (whole bag) */
  frozenAt?: number;
  thawedAt?: number;
  /** ms */
  createdAt: number;
  updatedAt: number;
}

const KEY = "metbarista_coffees";

export const coffeeKey = (name: string) => asciiName(name.trim()).toLowerCase();

function readAll(): Record<string, Coffee> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Coffee>; } catch { return {}; }
}

function writeAll(all: Record<string, Coffee>): void {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ }
}

/**
 * Every coffee: the ones saved here and the ones only brewed on the Station,
 * in the order you last brewed them (never brewed ones last, newest first).
 */
export function listCoffees(): Coffee[] {
  const saved = readAll();
  const out: Coffee[] = [];
  const seen = new Set<string>();
  for (const name of recentBeans()) {
    const key = coffeeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(saved[key] ?? { key, name, status: "open", createdAt: 0, updatedAt: 0 });
  }
  const rest = Object.values(saved).filter((c) => !seen.has(c.key)).sort((a, b) => b.createdAt - a.createdAt);
  return [...out, ...rest];
}

export function getCoffee(name: string): Coffee | null {
  return listCoffees().find((c) => c.key === coffeeKey(name)) ?? null;
}

/** Adds or updates a coffee (the name is its identity: shots carry it) */
export function saveCoffee(input: Pick<Coffee, "name"> & Partial<Omit<Coffee, "key" | "createdAt" | "updatedAt">>): Coffee {
  const name = input.name.trim();
  const key = coffeeKey(name);
  if (!key) throw new Error("A coffee needs a name");
  const all = readAll();
  const now = Date.now();
  const cur = all[key];
  const next: Coffee = {
    key,
    // Keep the name as written when it was first brewed ("Etiópia", not "etiopia")
    name: cur?.name ?? recentBeans().find((b) => coffeeKey(b) === key) ?? name,
    roaster: input.roaster !== undefined ? input.roaster.trim() || undefined : cur?.roaster,
    notes: input.notes !== undefined ? input.notes.trim() || undefined : cur?.notes,
    status: input.status ?? cur?.status ?? "open",
    freezeMode: input.freezeMode !== undefined ? input.freezeMode : cur?.freezeMode,
    doses: input.doses !== undefined ? input.doses : cur?.doses,
    frozenAt: input.frozenAt !== undefined ? input.frozenAt : cur?.frozenAt,
    thawedAt: input.thawedAt !== undefined ? input.thawedAt : cur?.thawedAt,
    createdAt: cur?.createdAt ?? now,
    updatedAt: now,
  };
  // Into the freezer: remember when (and default to the way it was frozen before, or doses)
  const wasFrozen = (cur?.status ?? listCoffees().find((c) => c.key === key)?.status) === "frozen";
  if (next.status === "frozen") {
    next.freezeMode ??= "doses";
    if (!wasFrozen) { next.frozenAt = input.frozenAt ?? now; next.thawedAt = undefined; }
    if (next.freezeMode === "doses" && next.doses != null) next.doses = Math.max(0, Math.round(next.doses));
  } else if (wasFrozen && next.status === "open" && next.freezeMode === "bag") {
    // A whole bag out of the freezer: thawed now
    next.thawedAt = input.thawedAt ?? now;
  }
  all[key] = next;
  writeAll(all);
  return next;
}

export function setCoffeeStatus(name: string, status: CoffeeStatus): void {
  saveCoffee({ name, status });
}

/** Can be brewed now: not finished, and not a whole bag still in the freezer */
export function brewable(c: Coffee): boolean {
  return c.status !== "finished" && !(c.status === "frozen" && c.freezeMode === "bag");
}

/** Coffees for the Station's list, in brewing order */
export function activeBeans(): string[] {
  return listCoffees().filter(brewable).map((c) => c.name);
}

/** A whole bag out of the freezer */
export function thawCoffee(name: string): void {
  saveCoffee({ name, status: "open", thawedAt: Date.now() });
}

/**
 * A shot of this coffee started: one frozen dose used. Returns the doses left,
 * or null when the coffee isn't counted in doses.
 */
export function takeDose(name: string | undefined): number | null {
  if (!name?.trim()) return null;
  const c = getCoffee(name);
  if (!c || c.status !== "frozen" || c.freezeMode !== "doses" || c.doses == null) return null;
  const left = Math.max(0, c.doses - 1);
  saveCoffee({ name: c.name, doses: left });
  return left;
}

/** "3 days ago", "today" */
export function daysAgo(ms: number, now = Date.now()): string {
  const d = Math.floor((now - ms) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * Removes a coffee from the shelf and from the Station's list (a typo, a test).
 * Its shots keep the name; bag photos are removed by the caller (coffee-photos.ts).
 */
export function deleteCoffee(name: string): void {
  const key = coffeeKey(name);
  const all = readAll();
  delete all[key];
  writeAll(all);
  try {
    localStorage.setItem(RECENT_BEANS_KEY, JSON.stringify(recentBeans().filter((b) => coffeeKey(b) !== key)));
  } catch { /* storage blocked */ }
}
