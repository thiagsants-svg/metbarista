/**
 * Brew control chart for espresso: extraction yield (EY, %) across, strength
 * (TDS, %) up, like DiFluid's app. Since EY = TDS × ratio, each ratio is a line
 * TDS = EY / ratio. The target box follows DiFluid's espresso standards
 * (EY 18-22 %; TDS by style), picked from the shot's ratio.
 */

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

/** Style from the ratio: up to 1:1.5 ristretto, from 1:3 lungo, normale between */
export function targetFor(ratio: number | undefined): BrewTarget {
  if (ratio != null && ratio <= 1.5) return TARGETS.ristretto;
  if (ratio != null && ratio >= 3) return TARGETS.lungo;
  return TARGETS.normale;
}

export type Extraction = "under" | "ideal" | "over";
export type Strength = "weak" | "ideal" | "strong";

export interface BrewVerdict {
  extraction: Extraction;
  strength: Strength;
  /** "Under-extracted · strength OK" */
  text: string;
  /** What usually moves the point toward the box */
  hint: string | null;
}

export function brewVerdict(tds: number, ey: number, target: BrewTarget): BrewVerdict {
  const extraction: Extraction = ey < target.ey[0] ? "under" : ey > target.ey[1] ? "over" : "ideal";
  const strength: Strength = tds < target.tds[0] ? "weak" : tds > target.tds[1] ? "strong" : "ideal";
  const ex = { under: "Under-extracted", ideal: "Extraction in range", over: "Over-extracted" }[extraction];
  const st = { weak: "weak", ideal: "strength OK", strong: "strong" }[strength];
  const hint =
    extraction === "under" ? "more extraction: warmer, finer or a longer ratio"
    : extraction === "over" ? "less extraction: cooler, coarser or a shorter ratio"
    : strength === "weak" ? "stronger: a shorter ratio"
    : strength === "strong" ? "lighter: a longer ratio"
    : null;
  return { extraction, strength, text: `${ex} · ${st}`, hint };
}
