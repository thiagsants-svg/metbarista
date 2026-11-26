/**
 * Bar down at the start of a shot: the group's lowest thermometer, by the puck.
 * The machine keeps it in every shot's own samples (sensors.bar_down), so it is
 * read from the first sample, for old shots too. Read only.
 *
 * Kept per shot on this device (filled while the Stats page reads the shots for
 * the piston), so the Shots page, the TDS estimate and the AI review have it
 * even for shots read without their curves.
 */

import type { ShotEntry, ShotFrame } from "./types";

const KEY = "not9bar_bar_down_v1";
/** How close to the target counts as "ready", °C (same as the heating view) */
export const READY_MARGIN = 2;

/** shot id → [unix s, Bar down at start °C | null, target °C | null] */
type Cache = Record<string, [number, number | null, number | null]>;

function read(): Cache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cache; } catch { return {}; }
}

/** Bar down (°C) at the shot's first sample, or null */
export function barDownAtStart(frames: ShotFrame[] | undefined): number | null {
  for (const f of frames ?? []) {
    const v = Number((f.sensors as Record<string, unknown> | undefined)?.bar_down);
    if (Number.isFinite(v) && v > 0) return Math.round(v * 10) / 10;
  }
  return null;
}

/** The shot's target temperature: the recipe's, as loaded on the machine */
export function shotTarget(shot: ShotEntry): number | null {
  const t = Number(shot.profile?.temperature);
  return Number.isFinite(t) && t > 0 ? t : null;
}

export function hasBarDown(id: string): boolean {
  return id in read();
}

/** Remembers the shots' Bar down (from shots read with their curves) */
export function rememberBarDown(shots: ShotEntry[]): void {
  const c = read();
  let changed = false;
  for (const s of shots) {
    if (!s.data?.length || s.id in c) continue;
    c[s.id] = [s.time, barDownAtStart(s.data), shotTarget(s)];
    changed = true;
  }
  if (changed) try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage full: read again next time */ }
}

/** Bar down at start for a shot: from its samples, else what was remembered */
export function barDownOf(shot: Pick<ShotEntry, "id" | "data">): number | null {
  return barDownAtStart(shot.data) ?? read()[shot.id]?.[1] ?? null;
}

export interface BarDownShot { id: string; t: number; barDown: number; target: number }

/** Every remembered shot with both values */
export function rememberedBarDown(): BarDownShot[] {
  return Object.entries(read()).flatMap(([id, [t, b, g]]) => (b != null && g != null ? [{ id, t, barDown: b, target: g }] : []));
}

export interface GapGroup {
  label: string;
  shots: number;
  rated: number;
  liked: number;
  eys: number[];
}

/** Shots grouped by how far below the target the Bar down was at the start */
export function byGap(shots: { gap: number; face?: "like" | "dislike" | null; ey?: number | null }[]): GapGroup[] {
  const groups: GapGroup[] = [
    { label: `within ${READY_MARGIN} °C`, shots: 0, rated: 0, liked: 0, eys: [] },
    { label: `${READY_MARGIN}–5 °C below`, shots: 0, rated: 0, liked: 0, eys: [] },
    { label: "more than 5 °C below", shots: 0, rated: 0, liked: 0, eys: [] },
  ];
  for (const s of shots) {
    const g = groups[s.gap <= READY_MARGIN ? 0 : s.gap <= 5 ? 1 : 2];
    g.shots++;
    if (s.face) { g.rated++; if (s.face === "like") g.liked++; }
    if (s.ey != null) g.eys.push(s.ey);
  }
  return groups;
}
