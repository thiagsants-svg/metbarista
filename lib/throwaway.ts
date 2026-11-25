/**
 * Is a saved shot a real shot, or a flush, a test, a scale knock? Read from the
 * shot's own samples. (What's left of MetBarista's shot analysis: its scores
 * aren't shown anywhere here, so only this check stayed.)
 */

import type { ShotEntry, ShotFrame } from "./types";

/** Under this average temperature it was cold water: a flush or a warm-up */
const MIN_BREW_TEMP_C = 70;
/** Over this the scale was pressed or knocked, not filled */
const MAX_PLAUSIBLE_WEIGHT_G = 200;

export function throwawayReason(frames: ShotFrame[]): string | null {
  if (frames.length < 5) return "Too few data frames";

  const lastTime = frames[frames.length - 1]?.time ?? 0;
  if (lastTime < 8000) return "Shot under 8 seconds: likely a flush";

  const weights = frames.map((f) => f.shot.weight).filter((w) => !isNaN(w));
  const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
  if (maxWeight > MAX_PLAUSIBLE_WEIGHT_G) return `Weight ${maxWeight.toFixed(0)} g: scale error`;

  const temps = frames
    .filter((f) => f.time > 3000)
    .map((f) => f.sensors?.bar_mid_up)
    .filter((t): t is number => typeof t === "number" && !isNaN(t) && t > 0);
  if (temps.length > 5) {
    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    if (avgTemp < MIN_BREW_TEMP_C) return `Brew temp ${avgTemp.toFixed(0)} °C: flush or warm-up`;
  }
  return null;
}

/** A flush, a test or a scale error: not a shot to count or compare */
export function isThrowaway(shot: ShotEntry): boolean {
  return throwawayReason(shot.data ?? []) != null;
}
