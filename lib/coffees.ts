/**
 * The coffee shelf, on this device: every coffee you have, with a few details,
 * where it is (in use, in the freezer, finished) and bag photos (kept apart,
 * see coffee-photos.ts). Coffees brewed on the Station appear here by
 * themselves; finished ones leave the Station's list but keep their shots.
 */

import { asciiName, recentBeans } from "./recipe";

const RECENT_BEANS_KEY = "metbarista_recent_beans";

export type CoffeeStatus = "open" | "frozen" | "finished";

export const STATUS_LABEL: Record<CoffeeStatus, string> = {
  open: "In use",
  frozen: "Frozen",
  finished: "Finished",
};

export interface Coffee {
  /** asciiName, lower case: how shots and plans find the coffee */
  key: string;
  name: string;
  roaster?: string;
  /** Origin, process, tasting notes on the bag… */
  notes?: string;
  status: CoffeeStatus;
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
    createdAt: cur?.createdAt ?? now,
    updatedAt: now,
  };
  all[key] = next;
  writeAll(all);
  return next;
}

export function setCoffeeStatus(name: string, status: CoffeeStatus): void {
  saveCoffee({ name, status });
}

/** Coffees for the Station's list: everything not finished, in brewing order */
export function activeBeans(): string[] {
  return listCoffees().filter((c) => c.status !== "finished").map((c) => c.name);
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
