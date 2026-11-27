/**
 * Piston health on this device: the after-shot lift reading of every shot
 * (worked out once from the machine's history, then kept here so only new
 * shots are read again) and the maintenance you logged (grease, descale).
 *
 * The readings are under "not9bar_": they can always be worked out again, so
 * they stay out of backups. The maintenance log is yours, so it's
 * "metbarista_" and goes in the backup.
 */

import { getHistoryLight, searchHistory } from "./machine-api";
import { afterShotLift, type LiftReading } from "./piston";
import { barDownIds, rememberBarDown } from "./bar-down";

const READINGS_KEY = "not9bar_piston_v1";
const LOG_KEY = "metbarista_maintenance";

/** shot id -> [unix seconds, amps or null when the shot had no usable lift] */
type Cache = Record<string, [number, number | null]>;

function readCache(): Cache {
  try { return JSON.parse(localStorage.getItem(READINGS_KEY) ?? "{}") as Cache; } catch { return {}; }
}
function writeCache(c: Cache) {
  try { localStorage.setItem(READINGS_KEY, JSON.stringify(c)); } catch { /* storage full: read again next time */ }
}

export function cachedReadings(): LiftReading[] {
  return Object.values(readCache())
    .filter((v): v is [number, number] => v[1] != null)
    .map(([t, a]) => ({ t, a }))
    .sort((x, y) => x.t - y.t);
}

/** Days with shots not yet measured, a few at a time */
const CHUNK_S = 3 * 86_400;

/**
 * Measures the shots not measured yet. Reads the list of shots (light), then
 * the missing ones a few days at a time, one request after another with a
 * pause, so the machine never sends more than a few MB at once.
 */
export async function updateReadings(
  onProgress: (done: number, total: number, readings: LiftReading[]) => void,
  isAlive: () => boolean,
): Promise<LiftReading[]> {
  const cache = readCache();
  const shots = await getHistoryLight(100_000);
  // Also read once the shots whose Bar down at start isn't known yet (lib/bar-down.ts)
  const seen = barDownIds();
  const missingShots = shots.filter((s) => !(s.id in cache) || !seen.has(s.id)).sort((a, b) => a.time - b.time);
  const missing = missingShots.map((s) => s.time).sort((a, b) => a - b);
  const total = missing.length;
  let done = 0;
  onProgress(0, total, cachedReadings());
  let i = 0;
  while (i < missing.length && isAlive()) {
    const start = missing[i] - 1;
    const end = start + CHUNK_S;
    const got = await searchHistory(start, end);
    for (const shot of got) {
      const lift = afterShotLift(shot.data ?? []);
      cache[shot.id] = [shot.time, lift ? lift.current : null];
    }
    // Shots of this window the search didn't return: marked, so they're not asked for on every visit
    const gotIds = new Set(got.map((s) => s.id));
    const absent = missingShots.filter((s) => s.time >= start && s.time < end && !gotIds.has(s.id));
    for (const s of absent) if (!(s.id in cache)) cache[s.id] = [s.time, null];
    writeCache(cache);
    rememberBarDown(got, absent);
    while (i < missing.length && missing[i] < end) { i++; done++; }
    onProgress(done, total, cachedReadings());
    await new Promise((r) => setTimeout(r, 300));
  }
  return cachedReadings();
}

// ── Maintenance log ──────────────────────────────────────────

/** Every shot read so far (unix seconds), measured or not: to count shots since a maintenance */
export function shotTimes(): number[] {
  return Object.values(readCache()).map(([t]) => t).sort((a, b) => a - b);
}

// ── Maintenance counter (idea from ha-meticulous-cards by cjborchert, MIT) ──

const INTERVALS_KEY = "metbarista_maintenance_intervals";
/** Shots between greasing and between descaling: starting values, set your own */
export const DEFAULT_INTERVALS = { grease: 100, descale: 200 };
export type Intervals = typeof DEFAULT_INTERVALS;

export function loadIntervals(): Intervals {
  try { return { ...DEFAULT_INTERVALS, ...JSON.parse(localStorage.getItem(INTERVALS_KEY) ?? "{}") }; } catch { return DEFAULT_INTERVALS; }
}
export function saveIntervals(v: Intervals): void {
  try { localStorage.setItem(INTERVALS_KEY, JSON.stringify(v)); } catch { /* storage full */ }
}

export interface MaintenanceCount {
  kind: "grease" | "descale";
  /** The last one logged (YYYY-MM-DD), or null: counted from the first shot */
  lastDay: string | null;
  shots: number;
  every: number;
  due: boolean;
}

/** Shots since the last grease, against its interval (no descale counter: fresh water every shot leaves little scale) */
export function maintenanceCounts(times: number[], log: Maintenance[], intervals: Intervals): MaintenanceCount[] {
  return (["grease"] as const).map((kind) => {
    const lastDay = log.filter((m) => m.kind === kind).map((m) => m.day).sort().at(-1) ?? null;
    const from = lastDay ? daySec(lastDay) : -Infinity;
    const shots = times.filter((t) => t >= from).length;
    return { kind, lastDay, shots, every: intervals[kind], due: shots >= intervals[kind] };
  });
}

export type MaintenanceKind = "grease" | "descale" | "other";
/** What can be logged now ("descale" stays readable in old logs, not offered) */
export const LOGGABLE: MaintenanceKind[] = ["grease", "other"];

export const MAINTENANCE_LABEL: Record<MaintenanceKind, string> = {
  grease: "Greased the piston",
  descale: "Descaled",
  other: "Other service",
};

export interface Maintenance {
  id: string;
  /** Local day, "2026-11-24" */
  day: string;
  kind: MaintenanceKind;
}

export function listMaintenance(): Maintenance[] {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as Maintenance[];
    return Array.isArray(list) ? list.sort((a, b) => a.day.localeCompare(b.day)) : [];
  } catch { return []; }
}

function saveMaintenance(list: Maintenance[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(list));
}

export function addMaintenance(day: string, kind: MaintenanceKind): Maintenance[] {
  const list = [...listMaintenance(), { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, day, kind }];
  saveMaintenance(list);
  return listMaintenance();
}

export function deleteMaintenance(id: string): Maintenance[] {
  saveMaintenance(listMaintenance().filter((m) => m.id !== id));
  return listMaintenance();
}

/** Start of a local day in unix seconds */
export const daySec = (day: string) => new Date(`${day}T00:00:00`).getTime() / 1000;
