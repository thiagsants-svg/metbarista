/**
 * Piston health: how hard the motor works to lift the piston after each shot.
 *
 * Right after every shot the machine pulls the piston up at full drive with the
 * pressure back at 0 bar. The drive is the same every time, so the only load
 * that changes from shot to shot is the seal's friction, and it shows up as
 * motor current. It creeps up as the seal dries or scale builds, and drops
 * after greasing or descaling. Method and thresholds from hessius/ha-meticulous
 * (MIT), measured there over ~500 shots.
 *
 * Read only: everything comes from the shots the machine already keeps.
 */

import type { ShotFrame } from "./types";

/** |drive %|: the move runs at full drive */
const MIN_DRIVE = 99;
/** |mm/s|: the steady part only, not the pressure release */
const MIN_SPEED = 8;
/** bar */
const MAX_PRESSURE = 0.1;
/** Piston position (mm) covered by nearly every shot, whatever the dose */
const WINDOW: [number, number] = [35, 55];
const MIN_SAMPLES = 5;

/** States before "retracting" that mean it's the retract before a shot, not after */
const PRE_SHOT = new Set(["", "unknown", "idle", "click to start", "heating", "preheating", "starting...", "boot", "home", "purge", "finished"]);

const norm = (s: unknown) => (typeof s === "string" ? s.replace(/_/g, " ").trim().toLowerCase() : "");

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/** Median motor current (A) and speed (mm/s) of the steady after-shot lift, or null */
export function afterShotLift(frames: ShotFrame[]): { current: number; speed: number } | null {
  let state: string | null = null;
  let before: string | null = null;
  const current: number[] = [];
  const speed: number[] = [];
  for (const f of frames) {
    const st = norm(f.status);
    if (!st) { state = before = null; continue; }
    if (st !== state) { before = state; state = st; }
    if (state !== "retracting" || before == null || PRE_SHOT.has(before)) continue;
    const s = f.sensors;
    const p = Number(f.shot?.pressure);
    if (!s) continue;
    const pos = Number(s.motor_position), spd = Number(s.motor_speed), drive = Number(s.motor_power), amps = Number(s.motor_current);
    if (![pos, spd, drive, amps, p].every(Number.isFinite)) continue;
    if (drive <= -MIN_DRIVE && spd <= -MIN_SPEED && Math.abs(p) < MAX_PRESSURE && pos >= WINDOW[0] && pos <= WINDOW[1]) {
      current.push(Math.abs(amps));
      speed.push(Math.abs(spd));
    }
  }
  if (current.length < MIN_SAMPLES) return null;
  return { current: Math.round(median(current) * 1000) / 1000, speed: Math.round(median(speed) * 100) / 100 };
}

/** One shot's reading: unix seconds and amps */
export interface LiftReading { t: number; a: number }

export interface PistonWeek { start: number; amps: number; shots: number }

const DAY = 86_400_000;
/** Monday 00:00 local of the week holding `ms` */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - ((d.getDay() + 6) % 7) * DAY;
}

/** Weekly medians, oldest first (single shots scatter, a week's median doesn't) */
export function weekly(readings: LiftReading[]): PistonWeek[] {
  const weeks = new Map<number, number[]>();
  for (const r of readings) {
    const k = weekStart(r.t * 1000);
    const list = weeks.get(k);
    if (list) list.push(r.a); else weeks.set(k, [r.a]);
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, a]) => ({ start, amps: median(a), shots: a.length }));
}

export interface PistonSummary {
  /** Median of the latest shots */
  now: number;
  /** Median of the first shots on record */
  first: number;
  /** now vs first, in % */
  change: number;
  /** Shots measured */
  n: number;
}

/** Level now (last `span` shots) against the start of the record (first `span`) */
export function summarise(readings: LiftReading[], span = 20): PistonSummary | null {
  if (readings.length < 10) return null;
  const sorted = [...readings].sort((a, b) => a.t - b.t);
  const k = Math.min(span, Math.floor(sorted.length / 2));
  const first = median(sorted.slice(0, k).map((r) => r.a));
  const now = median(sorted.slice(-k).map((r) => r.a));
  return { now, first, change: ((now - first) / first) * 100, n: sorted.length };
}

/** The median over the shots after `fromSec` vs the same number of shots just before it */
export function beforeAfter(readings: LiftReading[], fromSec: number, span = 15): { before: number; after: number; n: number } | null {
  const sorted = [...readings].sort((a, b) => a.t - b.t);
  const after = sorted.filter((r) => r.t >= fromSec).slice(0, span);
  const before = sorted.filter((r) => r.t < fromSec).slice(-span);
  if (after.length < 3 || before.length < 3) return null;
  return { before: median(before.map((r) => r.a)), after: median(after.map((r) => r.a)), n: after.length };
}
