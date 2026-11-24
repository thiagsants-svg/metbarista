/**
 * Station: the espresso glass next to the live chart, as numbers (no drawing).
 *
 * The scale's weight fills the glass. Fresh espresso lands as one golden,
 * cloudy mass; the dark coffee then separates from the bottom up and the crema
 * ends as a thin layer on top. This file steps that state; the component
 * `espresso-glass.tsx` draws it.
 */

export interface GlassInput {
  /** Weight in the cup (g) */
  weight: number;
  /** Recipe's target weight (g), if known */
  target: number | null;
  /** Flow into the cup (g/s), if known: sets how thick the stream is */
  flow: number | null;
  /** Coffee is being pulled right now */
  brewing: boolean;
  /** What the scale reads right now (g): after the flow is cut, the last drips still land */
  scale?: number | null;
}

export interface GlassState {
  /** Liquid shown in the glass (g): follows the scale, eased */
  level: number;
  /** Dark coffee already separated at the bottom (g) */
  settled: number;
  /** Stream from the basket, 0 (none) to 1 (full) */
  pour: number;
  /** Droplets on the basket before the first drop falls, 0 to 1 */
  beads: number;
  /** How stirred up the liquid is, 0 (still) to 1 (pouring) */
  turb: number;
  /** Stream thickness, as smoothed flow (g/s) */
  flow: number;
  /** Seconds since the weight last went up */
  sinceRise: number;
  /** Last weight seen, to notice it going up */
  lastWeight: number;
  /** This shot already reached its target weight: the stream is cut */
  reached: boolean;
  /** Weight the glass is heading to (g): the shot's, plus the drips after the cut */
  cup: number;
  /** Weight when the flow was cut (g): drips can only add a little to it */
  cutWeight: number;
  /** Shot weight last given, to notice another shot's weight coming in */
  shotWeight: number;
  /** Seconds since the flow was cut */
  sinceCut: number;
  /** Seconds simulated: drives the moving clouds and the stream */
  time: number;
}

/** Share of the liquid that stays as crema once the glass is still */
export const CREMA_REST = 0.13;

const DEFAULT_FLOW = 1.6;
/** After the cut, the scale is followed for this long (s) and up to this much more (g) */
const DRIP_SECONDS = 20;
const DRIP_MAX_G = 6;

/** Fraction of the way to a goal after `dt` seconds, for a time constant `tau` (s) */
function ease(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

function cleanWeight(w: number): number {
  return Number.isFinite(w) && w > 0 ? w : 0;
}

/** Empty glass while a shot runs; a finished, still glass otherwise. */
export function initialGlass(input: GlassInput): GlassState {
  const w = input.brewing ? 0 : cleanWeight(input.weight);
  return {
    level: w, settled: w * (1 - CREMA_REST), pour: 0, beads: 0, turb: 0,
    flow: DEFAULT_FLOW, sinceRise: 99, lastWeight: w, reached: false,
    cup: w, cutWeight: w, shotWeight: cleanWeight(input.weight), sinceCut: 99, time: 0,
  };
}

/** Jump to where the glass would end up, with no motion (reduced motion). */
export function snapGlass(s: GlassState, input: GlassInput): void {
  const w = cleanWeight(input.weight);
  s.level = w;
  // Mid-shot the liquid is still mostly cloudy
  s.settled = w * (input.brewing ? 0.35 : 1 - CREMA_REST);
  s.pour = 0;
  s.beads = 0;
  s.turb = input.brewing ? 0.5 : 0;
  s.lastWeight = w;
  s.cup = w;
  s.cutWeight = w;
  s.shotWeight = w;
}

/**
 * Advance the glass by `dt` seconds. Returns false once nothing is moving
 * any more, so the caller can stop redrawing.
 */
export function stepGlass(s: GlassState, input: GlassInput, dt: number): boolean {
  s.time += dt;

  // During the shot the glass follows the shot's weight. The machine cuts the flow
  // a little before the target and the last drips finish it: for a while after
  // the cut the glass follows the scale up (never down: the cup may be taken away).
  const shot = cleanWeight(input.weight);
  if (input.brewing) {
    s.sinceCut = 0;
    s.cup = shot;
    s.cutWeight = shot;
  } else {
    s.sinceCut += dt;
    if (shot !== s.shotWeight) { s.cup = shot; s.cutWeight = shot; }
    const scale = input.scale;
    if (s.sinceCut < DRIP_SECONDS && scale != null && Number.isFinite(scale)
        && scale > s.cup && scale <= s.cutWeight + DRIP_MAX_G) s.cup = scale;
  }
  s.shotWeight = shot;
  const w = s.cup;

  if (w > s.lastWeight + 0.03) s.sinceRise = 0;
  else s.sinceRise += dt;
  if (Math.abs(w - s.lastWeight) > 0.03) s.lastWeight = w;

  // Target weight reached: the machine cuts the flow, so the stream stops here even
  // if the last drips still add weight. Stays cut until the next shot.
  if (!input.brewing) s.reached = false;
  else if (input.target != null && input.target > 0 && w >= input.target) s.reached = true;

  // Stream: on while the scale keeps climbing during the shot
  const pouring = input.brewing && !s.reached && w > 0.2 && s.sinceRise < 1.2;
  // Flow cut but the scale still climbing: single drops (a weak "stream")
  const dripping = !pouring && w > 0.2 && s.sinceRise < 1.5 && (s.reached || s.sinceCut < DRIP_SECONDS);
  s.pour += ((pouring ? 1 : dripping ? 0.3 : 0) - s.pour) * ease(dt, pouring ? 0.3 : 0.7);
  if (input.flow != null && Number.isFinite(input.flow) && input.flow > 0) {
    s.flow += (Math.min(input.flow, 5) - s.flow) * ease(dt, 0.6);
  }

  // Basket sweats first: droplets grow until the first drop falls
  const sweating = input.brewing && !pouring && w < 0.5;
  if (sweating) s.beads = Math.min(1, s.beads + dt / 7);
  else s.beads += (0 - s.beads) * ease(dt, pouring ? 0.5 : 1.2);

  // Emptied cup (taken off the scale): the glass empties fast, filling is gentle
  s.level += (w - s.level) * ease(dt, w < s.level ? 0.35 : 0.22);

  s.turb += ((pouring ? 1 : 0) - s.turb) * ease(dt, pouring ? 1 : 6);

  // Dark coffee separates slowly while the stream stirs it, faster once it stops
  const goal = s.level * (1 - CREMA_REST);
  const rate = 0.2 + (0.03 - 0.2) * s.turb;
  s.settled += (goal - s.settled) * (1 - Math.exp(-dt * rate));
  s.settled = Math.max(0, Math.min(s.settled, s.level));

  // Keeps going through the drip window, to keep reading the scale
  return input.brewing || s.sinceCut < DRIP_SECONDS || s.pour > 0.01 || s.beads > 0.01 || s.turb > 0.02
    || Math.abs(w - s.level) > 0.05 || Math.abs(goal - s.settled) > 0.15;
}
