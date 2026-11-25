/**
 * What ended up in the cup. The machine stops a little before the target and
 * the last drops keep falling while it retracts, so the weight still grows
 * after the extraction. Then the cup is lifted, or swapped for the purge
 * jug: the scale drops to nothing or jumps up. From the first sudden step
 * after the extraction, the weight no longer counts. Idea from
 * ha-meticulous-cards by cjborchert (MIT); our own code.
 */

import type { ShotFrame } from "./types";

/** g between two readings (~0.13 s apart): drops add well under this, a cup moved far more */
export const CUP_MOVED_G = 3;

const weightOf = (f: ShotFrame) => (typeof f.shot?.weight === "number" && Number.isFinite(f.shot.weight) ? f.shot.weight : null);

export function cupWeight(frames: ShotFrame[]): number {
  const end = frames.findIndex((f) => /retract/i.test(f.status ?? ""));
  let best = 0;
  let prev: number | null = null;
  for (let i = 0; i < frames.length; i++) {
    const w = weightOf(frames[i]);
    if (w == null) continue;
    if (end >= 0 && i >= end && prev != null && Math.abs(w - prev) > CUP_MOVED_G) break;
    if (w > best) best = w;
    prev = w;
  }
  return best;
}
