/**
 * Puck resistance over a shot: pressure ÷ (cup flow)², like the resistance
 * line of pressure-profiling apps. Counted only once the first drops are in
 * the cup (2 g) and the cup flow is real (≥ 0.3 g/s); the cup flow is averaged
 * over ~1 s first, because the scale is noisy. Falling resistance is the puck
 * giving way: steady on a good shot, an early or steep fall on a channel.
 */

export interface ResistancePoint { t: number; pressure: number | null; grav: number | null; weight: number | null }

const FIRST_DROPS_G = 2;
const MIN_FLOW = 0.3;
const WINDOW_MS = 1000;

/** Resistance per point (bar per (g/s)²), null where it can't be told */
export function resistanceOf(points: ResistancePoint[]): (number | null)[] {
  const out: (number | null)[] = [];
  let start = 0;
  let poured = false;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    while (points[i].t - points[start].t > WINDOW_MS) start++;
    if ((p.weight ?? 0) >= FIRST_DROPS_G) poured = true;
    let sum = 0, n = 0;
    for (let j = start; j <= i; j++) { const g = points[j].grav; if (g != null && Number.isFinite(g)) { sum += g; n++; } }
    const flow = n ? sum / n : null;
    out.push(poured && flow != null && flow >= MIN_FLOW && p.pressure != null && p.pressure > 0.5
      ? Math.round((p.pressure / (flow * flow)) * 100) / 100 : null);
  }
  return out;
}
