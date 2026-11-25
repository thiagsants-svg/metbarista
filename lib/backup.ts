/**
 * Backup of what the Station keeps on the tablet (Chrome's localStorage):
 * coffees, grinders, the recipe, shot records (coffee + grind), notes with TDS,
 * next-shot plans… Saved as one JSON file you keep elsewhere (Drive, e-mail),
 * restored on the same or a new tablet.
 *
 * Bluetooth permission flags are left out: they belong to this browser and
 * would only confuse a new one (it asks to pair again anyway).
 *
 * Version 2 adds the coffees' bag photos (kept in IndexedDB, not localStorage).
 */

import type { CoffeePhoto } from "./coffee-photos";

const PREFIX = "metbarista_";
const APP = "metbarista-station";
export const BACKUP_VERSION = 2;
/** When the last backup was saved here (not part of the backup itself) */
export const BACKUP_AT_KEY = "metbarista_backup_at";

export interface Backup {
  app: typeof APP;
  version: number;
  savedAt: string;
  data: Record<string, string>;
  /** Bag photos (version 2); absent in older backups */
  photos?: CoffeePhoto[];
}

type Store = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** Keys that go in a backup */
export function backedUp(key: string): boolean {
  return key.startsWith(PREFIX) && !/_access(_v\d+)?$/.test(key) && key !== BACKUP_AT_KEY;
}

function keys(store: Store): string[] {
  const out: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && backedUp(k)) out.push(k);
  }
  return out.sort();
}

export function makeBackup(store: Store, now = new Date()): Backup {
  const data: Record<string, string> = {};
  for (const k of keys(store)) data[k] = store.getItem(k) ?? "";
  return { app: APP, version: BACKUP_VERSION, savedAt: now.toISOString(), data };
}

/** Parses a backup file; throws a readable message when it isn't one */
export function readBackup(text: string): Backup {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file isn't a Station backup (not JSON)."); }
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== APP || typeof b.data !== "object" || b.data === null) {
    throw new Error("This file isn't a Station backup.");
  }
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new Error("This backup comes from a newer Station: reload the page and try again.");
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.data)) if (backedUp(k) && typeof v === "string") data[k] = v;
  const photos = Array.isArray(b.photos)
    ? b.photos.filter((p): p is CoffeePhoto => !!p && typeof p.id === "string" && typeof p.coffee === "string"
      && typeof p.dataUrl === "string" && p.dataUrl.startsWith("data:image/") && typeof p.at === "number")
    : undefined;
  return { app: APP, version: b.version, savedAt: String(b.savedAt ?? ""), data, ...(photos ? { photos } : {}) };
}

/** Replaces this tablet's Station data with the backup's (Bluetooth permissions stay) */
export function restoreBackup(store: Store, backup: Backup): void {
  // What's here now, to put back if a write fails halfway (storage full)
  const before = keys(store).map((k) => [k, store.getItem(k)] as const);
  try {
    for (const [k] of before) store.removeItem(k);
    for (const [k, v] of Object.entries(backup.data)) store.setItem(k, v);
  } catch (e) {
    for (const k of keys(store)) store.removeItem(k);
    for (const [k, v] of before) if (v != null) store.setItem(k, v);
    throw new Error(`The backup couldn't be restored (${e instanceof Error ? e.message : e}); this tablet's data was kept.`);
  }
}

const count = (json: string | undefined): number => {
  if (!json) return 0;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0;
  } catch { return 0; }
};

/** What's inside, for people: "12 coffees · 3 grinders · 40 shot records…" */
export function backupSummary(b: Backup): string {
  const d = b.data;
  const parts = [
    [Math.max(count(d.metbarista_recent_beans), count(d.metbarista_coffees)), "coffee", "coffees"],
    [count(d.metbarista_recent_grinders), "grinder", "grinders"],
    [count(d.metbarista_shot_log), "shot record", "shot records"],
    [count(d.metbarista_shot_notes), "shot note", "shot notes"],
    [count(d.metbarista_next_plans), "next-shot plan", "next-shot plans"],
  ] as const;
  const text = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  const photos = b.photos?.length ?? 0;
  if (photos) text.push(`${photos} photo${photos === 1 ? "" : "s"}`);
  return text.length ? text.join(" · ") : "settings only";
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `station-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
