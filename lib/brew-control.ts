/**
 * Brew control chart for espresso: extraction yield (EY, %) across, strength
 * (TDS, %) up, like DiFluid's app. Since EY = TDS × ratio, each ratio is a line
 * TDS = EY / ratio. The target box: EY 18-24 % by default (light roasts on
 * lever profiles often taste best at 22-25 %), or the range of the coffee's own
 * liked shots once there are 3 measured ones: the target is what you like, not
 * a textbook. The box sits on the shot's own ratio line, so only the extraction
 * decides in or out: strength is what the ratio was chosen for (taste it on
 * the compass). Without a ratio, DiFluid's style boxes.
 */

/** % extraction counted as in range for espresso */
export const ESPRESSO_EY: [number, number] = [18, 24];

export interface BrewTarget {
  name: string;
  ey: [number, number];
  tds: [number, number];
}

export const TARGETS: Record<"ristretto" | "normale" | "lungo", BrewTarget> = {
  ristretto: { name: "Ristretto", ey: [18, 22], tds: [12, 18] },
  normale: { name: "Normale", ey: [18, 22], tds: [8, 12] },
  lungo: { name: "Lungo", ey: [18, 22], tds: [5, 8] },
};

/** Style from the ratio (up to 1:1.5 ristretto, from 1:3 lungo, normale between), its box on the ratio's own line */
export function targetFor(ratio: number | undefined, band: [number, number] | null = null): BrewTarget {
  const style = ratio != null && ratio <= 1.5 ? TARGETS.ristretto : ratio != null && ratio >= 3 ? TARGETS.lungo : TARGETS.normale;
  if (ratio == null || !(ratio > 0)) return band ? { ...style, name: "Your liked shots", ey: band } : style;
  const ey = band ?? ESPRESSO_EY;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { name: band ? "Your liked shots" : style.name, ey, tds: [r2(ey[0] / ratio), r2(ey[1] / ratio)] };
}

/** The EY range of the coffee's liked, measured shots (3 or more), a little wider; null with fewer */
export function likedBand(likedEys: number[]): [number, number] | null {
  const xs = likedEys.filter((e) => e > 10 && e < 30);
  if (xs.length < 3) return null;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const lo = Math.max(15, r1(Math.min(...xs) - 0.5));
  const hi = Math.min(27, r1(Math.max(...xs) + 0.5));
  // At least a 2 % wide box: a few close readings don't make a target that narrow
  const mid = (lo + hi) / 2;
  return hi - lo >= 2 ? [lo, hi] : [r1(mid - 1), r1(mid + 1)];
}
