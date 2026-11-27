/**
 * TDS estimated without measuring, from the shots of the same coffee you did
 * measure (DiFluid or typed): a shot made the same way extracts about the same,
 * so its extraction yield (EY) is taken as the typical EY of those shots, and
 * TDS follows from the dose and what reached the cup:
 *
 *   TDS ≈ EY × dose ÷ cup weight
 *
 * Similar = same dose (±1 g), ratio (±0.3), grind (±5 µm, one Motto step, or ±0.5 on a dial)
 * time (±20 %) and Bar down at the start (±1.5 °C), each only when both shots know it. With fewer than 3
 * similar shots it falls back to every measured shot of the coffee, and says
 * which way this shot differs (grind, time). The margin is how much those EYs
 * spread (one standard deviation), turned into TDS. Always shown as an
 * estimate, never saved as a reading (or estimates would feed the next ones).
 *
 * The idea of estimating TDS from earlier refractometer readings comes from
 * portal-met-bridge by privaterra (MIT), which calibrates a Belka Portal's
 * conductivity that way; the method here, without a sensor, is our own.
 */

import type { CoffeeLastShot } from "./coffee-history";
import { sameCoffee } from "./recipe";

/** A measured shot: what the estimate learns from */
export interface EyReference {
  coffee: string;
  dose: number;
  ratio: number | null;
  ey: number;
  /** µm on the Motto 80, or a dial setting */
  grind?: number | null;
  /** s */
  seconds?: number | null;
  /** Bar down at the start, °C */
  barDown?: number | null;
  /** Water recipe id */
  waterId?: string | null;
  /** The profile it was pulled with (base name): EY from different profiles doesn't compare */
  profile?: string | null;
  /** Brew temperature set, °C */
  temperature?: number | null;
}

/** Same profile, ignoring case and accents; unknown on either side counts as the same */
const sameProfile = (a: string | null | undefined, b: string | null | undefined) =>
  !a || !b || a.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === b.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export interface TdsEstimate {
  tds: number;
  /** ± one standard deviation of the EYs, as TDS */
  margin: number;
  /** The typical extraction yield it rests on, % */
  ey: number;
  /** Shots it learned from */
  n: number;
  /** "similar": made the same way · "coffee": any shot of the coffee */
  basis: "similar" | "coffee";
  /** How this shot differs from the measured ones ("grind 130 vs 135–150 µm"), when it does */
  differs: string[];
}

const MIN_SHOTS = 3;
/** °C: Bar down at the start counted as alike */
const BAR_DOWN_TOL = 1.5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

const close = (a: number | null | undefined, b: number | null | undefined, within: number) =>
  a == null || b == null || Math.abs(a - b) <= within;

export function estimateTds(
  shot: {
    coffee: string | null | undefined; dose: number; ratio?: number | null; cupWeight: number;
    grind?: number | null; seconds?: number | null; barDown?: number | null; waterId?: string | null;
    profile?: string | null; temperature?: number | null;
  },
  refs: EyReference[],
): TdsEstimate | null {
  if (!shot.coffee || !(shot.dose > 0) || !(shot.cupWeight > 0)) return null;
  const mine = refs.filter((r) => sameCoffee(r.coffee, shot.coffee) && r.ey > 5 && r.ey < 35);
  // A dial setting (single digits) moves in steps of ~0.5; microns in steps of ~10
  // One Motto 80 step is 5 µm
  const grindTol = shot.grind != null && shot.grind < 50 ? 0.5 : 5;
  const similar = mine.filter((r) => Math.abs(r.dose - shot.dose) <= 1
    && close(r.ratio, shot.ratio, 0.3)
    && close(r.grind, shot.grind, grindTol)
    && close(r.barDown, shot.barDown, BAR_DOWN_TOL)
    && sameProfile(r.profile, shot.profile)
    && close(r.temperature, shot.temperature, 1)
    && (r.seconds == null || shot.seconds == null || Math.abs(r.seconds - shot.seconds) <= 0.2 * r.seconds));
  // Only shots made the same way: the whole coffee mixes ratios, and EY moves with the ratio
  const pool = similar.length >= MIN_SHOTS ? similar : null;
  if (!pool) return null;
  const eys = pool.map((r) => r.ey);
  const ey = median(eys);
  const toTds = (e: number) => (e * shot.dose) / shot.cupWeight;

  // Outside what was measured: the estimate is a stretch there
  const differs: string[] = [];
  const range = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? [Math.min(...v), Math.max(...v)] as const : null;
  };
  const g = range(pool.map((r) => r.grind));
  if (g && shot.grind != null && (shot.grind < g[0] - grindTol || shot.grind > g[1] + grindTol)) {
    const unit = grindTol === 5 ? " µm" : "";
    differs.push(`grind ${shot.grind}${unit} vs ${g[0] === g[1] ? g[0] : `${g[0]}–${g[1]}`}${unit} measured`);
  }
  const t = range(pool.map((r) => r.seconds));
  if (t && shot.seconds != null && (shot.seconds < t[0] * 0.8 || shot.seconds > t[1] * 1.2)) {
    differs.push(`time ${Math.round(shot.seconds)} s vs ${Math.round(t[0])}–${Math.round(t[1])} s measured`);
  }

  const b = range(pool.map((r) => r.barDown));
  if (b && shot.barDown != null && (shot.barDown < b[0] - BAR_DOWN_TOL || shot.barDown > b[1] + BAR_DOWN_TOL)) {
    differs.push(`Bar down at start ${shot.barDown.toFixed(1)} °C vs ${b[0] === b[1] ? b[0].toFixed(1) : `${b[0].toFixed(1)}–${b[1].toFixed(1)}`} °C measured`);
  }

  return {
    tds: Math.round(toTds(ey) * 100) / 100,
    margin: Math.round(toTds(stdev(eys)) * 100) / 100,
    ey: Math.round(ey * 10) / 10,
    n: pool.length,
    basis: pool === similar ? "similar" : "coffee",
    differs,
  };
}

/** The measured shots among shot summaries (TDS and EY come from the notes on this device) */
export function eyReferences(shots: CoffeeLastShot[]): EyReference[] {
  return shots.flatMap((s) => (s.coffee && s.ey != null && s.patch.dose
    ? [{
      coffee: s.coffee, dose: s.patch.dose, ratio: s.patch.ratio ?? null, ey: s.ey,
      grind: s.patch.grindUm ?? s.patch.grindSetting ?? null, seconds: s.seconds > 0 ? s.seconds : null,
      barDown: s.barDown ?? null,
      waterId: s.waterId ?? null,
      profile: s.profileName || null,
      temperature: s.patch.temperature ?? null,
    }]
    : []));
}
