/**
 * Pour-over on the machine's scale: the Meticulous only weighs, the kettle is
 * yours. Nothing is sent to the machine (no tare: the page keeps its own zero),
 * nothing is saved on it: brews and recipes live in this browser (and in the
 * backup file, "metbarista_" names).
 *
 * The weights are kept apart so the ratio never gets lost: the server, the
 * brewer and the coffee are each weighed once at the start, the water is the
 * scale minus all three, the drink is what stays when the brewer is lifted.
 *
 * Idea from the Free Pour mode of the Meticulous dial (MeticulousHome/
 * meticulous-dial: pours found from the weight, guided recipes with a start
 * time, a stop weight and a flow per pour, the brewer lift ending the brew).
 * That code is GPL-3.0; this one is written from scratch.
 */

// ── Pour detection ──────────────────────────────────────────

export interface Sample { t: number; w: number }
export interface Pour { start: number; end: number | null; from: number; to: number }

export interface Detector {
  /** Brew clock zero (s, sample time), set when the first pour begins */
  t0: number | null;
  pours: Pour[];
  pouring: boolean;
  /** Last samples (about 2 s) for the smoothing and the flow */
  recent: Sample[];
  /** Since when the flow has been low (s), while pouring */
  calmSince: number | null;
}

export const newDetector = (): Detector => ({ t0: null, pours: [], pouring: false, recent: [], calmSince: null });

/** g/s above which water is going in */
export const START_FLOW = 1.2;
/** g/s below which the pour has stopped, held for STOP_HOLD s */
export const STOP_FLOW = 0.4;
export const STOP_HOLD = 1.2;
/** g risen above the last level before a new pour counts (a bump isn't a pour) */
export const MIN_RISE = 2;
/** g of water that must stay once a "pour" stops, or it was a bump */
export const MIN_POUR = 5;
/** g/s: faster than any kettle, a knock on the scale */
export const MAX_FLOW = 25;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Weight now (median of the last ~0.5 s) and flow (g/s, slope of the last ~1 s) */
export function smoothed(recent: Sample[]): { w: number; flow: number } {
  if (!recent.length) return { w: 0, flow: 0 };
  const last = recent[recent.length - 1];
  const w = median(recent.filter((s) => last.t - s.t <= 0.5).map((s) => s.w));
  const win = recent.filter((s) => last.t - s.t <= 1.0);
  if (win.length < 3 || last.t - win[0].t < 0.4) return { w, flow: 0 };
  const mt = win.reduce((a, s) => a + s.t, 0) / win.length;
  const mw = win.reduce((a, s) => a + s.w, 0) / win.length;
  const num = win.reduce((a, s) => a + (s.t - mt) * (s.w - mw), 0);
  const den = win.reduce((a, s) => a + (s.t - mt) ** 2, 0);
  const flow = den > 0 ? num / den : 0;
  return { w, flow: Math.max(-MAX_FLOW, Math.min(MAX_FLOW, flow)) };
}

/** Feeds one sample (water in g, the page's zero already taken off); returns the new state */
export function step(d: Detector, s: Sample): Detector {
  const recent = [...d.recent.filter((x) => s.t - x.t <= 2), s];
  const { w, flow } = smoothed(recent);
  const pours = d.pours.map((p) => ({ ...p }));
  let { t0, pouring, calmSince } = d;
  const level = pours.length ? pours[pours.length - 1].to : 0;

  if (!pouring) {
    if (flow >= START_FLOW && w >= level + MIN_RISE) {
      // Backdate the start to where the weight began to climb
      const startS = recent.find((x) => x.w > level + 0.5)?.t ?? s.t;
      if (t0 == null) t0 = startS;
      pours.push({ start: startS - t0, end: null, from: level, to: w });
      pouring = true;
      calmSince = null;
    }
  } else {
    const cur = pours[pours.length - 1];
    cur.to = Math.max(cur.to, w);
    if (flow < STOP_FLOW) {
      calmSince ??= s.t;
      if (s.t - calmSince >= STOP_HOLD) {
        cur.end = calmSince - (t0 ?? 0);
        pouring = false;
        calmSince = null;
        // A bump or a hand on the brewer, not a pour: forget it (and the clock, if it was the first)
        if (w - cur.from < MIN_POUR) {
          pours.pop();
          if (!pours.length) t0 = null;
        }
      }
    } else calmSince = null;
  }
  return { t0, pours, pouring, recent, calmSince };
}

/** The scale has held still: the last ~0.7 s within 0.6 g */
export function isStable(recent: Sample[]): boolean {
  if (recent.length < 4) return false;
  const last = recent[recent.length - 1];
  const win = recent.filter((s) => last.t - s.t <= 0.7);
  if (last.t - win[0].t < 0.5) return false;
  const ws = win.map((s) => s.w);
  return Math.max(...ws) - Math.min(...ws) <= 0.6;
}

/**
 * The brewer was lifted off: the water reading dropped by more than half the
 * brewer and wet coffee (and at least 28 g). Then the drink is what's left.
 */
export function brewerLifted(water: number, peakWater: number, brewer: number, dose: number): boolean {
  return peakWater - water > Math.max(28, 0.55 * (brewer + dose));
}

// ── Recipes ─────────────────────────────────────────────────

export interface RecipePour {
  /** s from the first pour's start */
  at: number;
  /** g of water in this pour */
  grams: number;
  /** s the pour should last (the flow is grams ÷ seconds) */
  seconds: number;
  /** Agitation after this pour */
  then?: "swirl" | "stir";
}

export interface PourRecipe {
  id: string;
  name: string;
  /** g of coffee the recipe was written for: other doses scale the water */
  dose: number;
  temperature: number;
  pours: RecipePour[];
  notes?: string;
}

const RECIPES_KEY = "metbarista_pourover_recipes";
const BREWS_KEY = "metbarista_pourover_brews";

export const DEFAULT_RECIPES: PourRecipe[] = [
  {
    id: "bloom-two", name: "Bloom and two pours", dose: 15, temperature: 96,
    pours: [{ at: 0, grams: 45, seconds: 10, then: "swirl" }, { at: 45, grams: 105, seconds: 20 }, { at: 90, grams: 90, seconds: 20, then: "swirl" }],
    notes: "1:16. Swirl to wet all the grounds in the bloom, and gently once more after the last pour. Cooler (90–93 °C) for darker roasts.",
  },
  {
    id: "five-equal", name: "Five equal pours", dose: 20, temperature: 95,
    pours: [0, 45, 90, 135, 180].map((at) => ({ at, grams: 60, seconds: 10 })),
    notes: "1:15. The first two pours set the sweetness and acidity, the last three the strength.",
  },
  {
    id: "one-long", name: "Bloom and one long pour", dose: 15, temperature: 96,
    pours: [{ at: 0, grams: 40, seconds: 10, then: "stir" }, { at: 40, grams: 200, seconds: 60, then: "swirl" }],
    notes: "1:16. Stir the bloom, then a slow, steady pour in circles; a gentle swirl at the end.",
  },
];

export function loadRecipes(): PourRecipe[] {
  if (typeof window === "undefined") return DEFAULT_RECIPES;
  try {
    const saved = localStorage.getItem(RECIPES_KEY);
    return saved ? (JSON.parse(saved) as PourRecipe[]) : DEFAULT_RECIPES;
  } catch { return DEFAULT_RECIPES; }
}
export function saveRecipes(list: PourRecipe[]): void {
  try { localStorage.setItem(RECIPES_KEY, JSON.stringify(list)); } catch { /* storage full */ }
}

export const recipeWater = (r: PourRecipe) => r.pours.reduce((a, p) => a + p.grams, 0);
export const recipeRatio = (r: PourRecipe) => recipeWater(r) / r.dose;

/**
 * The recipe for this dose: every pour's water scaled, its pouring time too so
 * the flow stays the same, and the later pours pushed back by the time added.
 * (A bigger bed also drains slower: a coarser grind may be needed.)
 */
export function scaleRecipe(r: PourRecipe, dose: number): PourRecipe {
  const k = dose > 0 ? dose / r.dose : 1;
  let shift = 0;
  const pours = r.pours.map((p) => {
    const seconds = Math.max(1, Math.round(p.seconds * k));
    const out = { ...p, at: Math.round(p.at + shift), grams: Math.round(p.grams * k), seconds };
    shift += seconds - p.seconds;
    return out;
  });
  return { ...r, dose, pours };
}

export interface Guide {
  /** 0-based pour to do now or next; pours.length when all are done */
  index: number;
  /** "wait": before its start · "pour": its time · "done": all poured */
  phase: "wait" | "pour" | "done";
  /** s until this pour starts (wait) */
  startsIn: number;
  /** Water the scale should read when this pour stops (g) */
  stopAt: number;
  /** g/s asked for this pour */
  flow: number;
}

/**
 * Where the recipe is at, from the clock and the water so far. A pour is
 * finished when its stop weight is reached (within 2 g), whatever the clock.
 */
export function guide(r: PourRecipe, clock: number, water: number): Guide {
  let total = 0;
  for (let i = 0; i < r.pours.length; i++) {
    const p = r.pours[i];
    total += p.grams;
    if (water >= total - 2) continue;
    const flow = p.seconds > 0 ? p.grams / p.seconds : 0;
    return clock < p.at
      ? { index: i, phase: "wait", startsIn: p.at - clock, stopAt: total, flow }
      : { index: i, phase: "pour", startsIn: 0, stopAt: total, flow };
  }
  return { index: r.pours.length, phase: "done", startsIn: 0, stopAt: total, flow: 0 };
}

// ── Brews ───────────────────────────────────────────────────

export interface PourBrew {
  id: string;
  /** ms */
  at: number;
  coffee: string;
  dose: number;
  grinder?: string;
  grind?: string;
  temperature?: number;
  /** The kettle's own reading when the first pour began */
  kettleTemp?: number;
  /** V60, flat-bottom, Chemex… */
  brewer?: string;
  /** Water used: its recipe (lib/water.ts) and, as text, what it was then */
  waterId?: string;
  waterNote?: string;
  /** g of water added to the drink after brewing */
  bypass?: number;
  /** s when the bed drained (tapped), else the brew ended at `seconds` */
  drained?: number;
  dry?: boolean;
  recipe?: string;
  pours: Pour[];
  /** [s, g of water] about twice a second */
  curve: [number, number][];
  water: number;
  /** g in the server once the brewer was lifted (null: not weighed) */
  drink: number | null;
  /** s from the first pour to the end */
  seconds: number;
  tds?: number;
  ey?: number;
  face?: "like" | "dislike";
  compass?: { x: number; y: number };
  notes?: string;
}

export function loadBrews(): PourBrew[] {
  if (typeof window === "undefined") return [];
  try { return (JSON.parse(localStorage.getItem(BREWS_KEY) ?? "[]") as PourBrew[]).sort((a, b) => b.at - a.at); } catch { return []; }
}
export function saveBrew(b: PourBrew): PourBrew[] {
  const list = [b, ...loadBrews().filter((x) => x.id !== b.id)];
  try { localStorage.setItem(BREWS_KEY, JSON.stringify(list)); } catch { /* storage full */ }
  return list;
}
export function deleteBrew(id: string): PourBrew[] {
  const list = loadBrews().filter((x) => x.id !== id);
  try { localStorage.setItem(BREWS_KEY, JSON.stringify(list)); } catch { /* storage full */ }
  return list;
}

/** Thins the samples to about two a second, for keeping */
export function thinCurve(samples: Sample[], t0: number): [number, number][] {
  const out: [number, number][] = [];
  let next = -Infinity;
  for (const s of samples) {
    const t = s.t - t0;
    if (t < -1 || t < next) continue;
    out.push([Math.round(t * 10) / 10, Math.round(s.w * 10) / 10]);
    next = t + 0.5;
  }
  return out;
}

export const fmtClock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
