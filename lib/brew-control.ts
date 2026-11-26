/**
 * Brew control chart for espresso: extraction yield (EY, %) across, strength
 * (TDS, %) up, like DiFluid's app. Since EY = TDS × ratio, each ratio is a line
 * TDS = EY / ratio. The target box: EY 18-23 % (good light roasts on
 * lever-style profiles land at 21-23 %), and the strength that EY gives at the
 * shot's own ratio, so the box sits on the ratio line and only the extraction
 * decides in or out: strength is what the ratio was chosen for (taste it on
 * the compass). Without a ratio, DiFluid's style boxes.
 */

/** % extraction counted as in range for espresso */
export const ESPRESSO_EY: [number, number] = [18, 23];

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
export function targetFor(ratio: number | undefined): BrewTarget {
  const style = ratio != null && ratio <= 1.5 ? TARGETS.ristretto : ratio != null && ratio >= 3 ? TARGETS.lungo : TARGETS.normale;
  if (ratio == null || !(ratio > 0)) return style;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { name: style.name, ey: ESPRESSO_EY, tds: [r2(ESPRESSO_EY[0] / ratio), r2(ESPRESSO_EY[1] / ratio)] };
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
    extraction === "under" ? "finer first, then 1-2 °C warmer"
    : extraction === "over" ? "coarser first, then 1-2 °C cooler"
    : strength === "weak" ? "a shorter ratio"
    : strength === "strong" ? "a longer ratio"
    : null;
  return { extraction, strength, text: `${ex} · ${st}`, hint };
}
