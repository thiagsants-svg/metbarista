/**
 * Auto brew: the Station taps Brew by itself once the machine is ready
 * ("click to start"), either right then (the water at temperature, the
 * machine's own ready) or once the Bar down is ready too (within the margin
 * of the target, or settled), so the group isn't cold. Off on every page load.
 */

import { barDownState, type HeatSample } from "../heat-log";

export type AutoBrew = "off" | "water" | "bardown";

/** The Bar down is ready for the shot (or this machine reports no Bar down: nothing to wait for) */
export function barDownGo(samples: HeatSample[], target: number | null | undefined): boolean {
  if (!samples.some((p) => typeof p.barDown === "number")) return true;
  const s = barDownState(samples, target ?? null);
  return s?.kind === "ready" || s?.kind === "settled";
}
