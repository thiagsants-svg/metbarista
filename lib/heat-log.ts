/**
 * Heating forecast vs reality. While the machine heats, the Station says how
 * long is left for the water (the tube) and for the Bar down (the group's
 * lowest thermometer) to get within 2 °C of the target. Here every heating is
 * logged on this device: every 30 s the moment each forecast said it would be
 * ready, then the moment it really was. Stats shows how far off they were, so
 * the forecast can be calibrated. Nothing is written to the machine.
 */

/** One second of the heating curve: the tube and every group thermometer */
export interface HeatSample {
  t: number; temp: number;
  barUp?: number; barMidUp?: number; barMidDown?: number; barDown?: number; ext1?: number; ext2?: number;
}

/** The curve's columns, in the order kept in the log */
export const CURVE_COLS = ["temp", "barUp", "barMidUp", "barMidDown", "barDown", "ext1", "ext2"] as const;
/** A curve row every this many seconds */
const CURVE_EVERY = 5;

/** Lowest tube temperature in the minute after the water went in at or above this: it was poured hot (°C) */
export const HOT_WATER_MIN = 70;
/** How long after the water went in to look for the dip, s */
const DIP_WINDOW = 60;

/** How close the Bar down must be to the target to count as ready, °C */
export const BAR_DOWN_MARGIN = 2;

/** Seconds left for the water to reach the target: 0 there, null when it can't tell */
export function waterLeft(samples: HeatSample[], target: number | null, current: number | null): number | null {
  if (target == null || current == null || samples.length < 4) return null;
  if (current >= target - 0.3) return 0;
  const last = samples[samples.length - 1];
  const from = samples.find((p) => last.t - p.t <= 30) ?? samples[0];
  const dt = last.t - from.t;
  if (dt < 10) return null;
  const rate = (last.temp - from.temp) / dt; // °C per second
  if (rate < 0.03) return null;
  return (target - current) / rate;
}

export type BarDownState =
  | { kind: "ready"; barDown: number }
  | { kind: "settled"; barDown: number }
  | { kind: "flat"; barDown: number }
  | { kind: "eta"; barDown: number; left: number };

/**
 * Where the Bar down stands: within the margin (ready), barely climbing any
 * more (settled, under 0.1 °C a minute over 2 min), not climbing yet (flat), or
 * seconds left from how fast it climbed over the last ~60 s (eta).
 */
export function barDownState(samples: HeatSample[], target: number | null, margin = BAR_DOWN_MARGIN): BarDownState | null {
  if (target == null) return null;
  const pts = samples.filter((p) => typeof p.barDown === "number") as (HeatSample & { barDown: number })[];
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const goal = target - margin;
  if (last.barDown >= goal) return { kind: "ready", barDown: last.barDown };
  const from = pts.find((p) => last.t - p.t <= 60) ?? pts[0];
  const dt = last.t - from.t;
  if (dt < 15) return null;
  const rate = (last.barDown - from.barDown) / dt;
  if (rate < 0.005 && dt < 110) return { kind: "flat", barDown: last.barDown };
  const early = pts.find((p) => last.t - p.t <= 120) ?? pts[0];
  if (last.t - early.t >= 110 && ((last.barDown - early.barDown) / (last.t - early.t)) * 60 < 0.1) {
    return { kind: "settled", barDown: last.barDown };
  }
  return { kind: "eta", barDown: last.barDown, left: (goal - last.barDown) / rate };
}

/** A forecast: at second t of the heating, it said ready at second `at` */
export interface HeatGuess { t: number; at: number }

/** What else is known about the heating, for a forecast that learns from past ones */
export interface HeatContext {
  /** The machine is asking for water ("Pour water and click to continue") */
  waitingForWater?: boolean;
  /** The machine's mains voltage (from its own info): 110–127 V heats slower than 220–240 V */
  voltage?: number;
  /** The heating profile's name */
  profile?: string;
}

export interface HeatRun {
  /** When the heating started, epoch ms */
  start: number;
  target: number;
  startTemp: number;
  startBarDown?: number;
  /** Every group thermometer when it started (how warm the machine already was) */
  startGroup?: Partial<Record<(typeof CURVE_COLS)[number], number>>;
  voltage?: number;
  profile?: string;
  /** Minutes since the last logged heating ended (a warm machine heats faster) */
  sincePrevMin?: number;
  /** Second of the heating the machine itself said it was ready (Brew to start) */
  machineReadyAt?: number;
  /** Last second of the heating seen */
  lastT?: number;
  /** The curve every 5 s: [t, ...CURVE_COLS], 0.1 °C */
  curve?: (number | null)[][];
  water: {
    guesses: HeatGuess[]; readyAt?: number;
    /** Second the water went in (the machine stopped asking for it) */
    addedAt?: number;
    /** Tube temperature just before, and the lowest in the minute after */
    tubeBefore?: number; tubeMinAfter?: number;
    /** Worked out from the dip, nothing to tap: cold tap water pulls the tube down, kettle water barely */
    kind?: "hot" | "cold";
  };
  barDown: { guesses: HeatGuess[]; readyAt?: number; how?: "ready" | "settled" };
}

const KEY = "metbarista_heat_log";
const KEEP = 60;
/** A forecast every this many seconds */
const EVERY = 30;

export function loadHeatRuns(): HeatRun[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

function saveRun(run: HeatRun): void {
  // Worth keeping once it has heated for a minute (a curve to learn from)
  if ((run.lastT ?? 0) < 60) return;
  try {
    const rest = loadHeatRuns().filter((r) => r.start !== run.start);
    localStorage.setItem(KEY, JSON.stringify([...rest, run].sort((a, b) => a.start - b.start).slice(-KEEP)));
  } catch { /* storage full */ }
}

/**
 * Takes the heating curve so far and updates the run: the curve every 5 s, a
 * new forecast every 30 s, the moment each one was reached, when the machine
 * said it was ready, and the context (voltage, profile, how warm it started).
 * Returns the run (null before there's a curve); saves it as it goes.
 */
export function stepHeatRun(
  run: HeatRun | null, samples: HeatSample[], target: number | null, startMs: number,
  ctx: HeatContext & { machineReady?: boolean } = {},
): HeatRun | null {
  if (!samples.length || target == null) return run;
  const last = samples[samples.length - 1];
  if (!run || run.start !== startMs || run.target !== target) {
    const first = samples[0];
    const prev = loadHeatRuns().filter((r) => r.start < startMs).pop();
    const prevEnd = prev ? prev.start + (prev.lastT ?? 0) * 1000 : null;
    run = {
      start: startMs, target, startTemp: first.temp, startBarDown: samples.find((p) => p.barDown != null)?.barDown,
      startGroup: Object.fromEntries(CURVE_COLS.filter((k) => typeof first[k] === "number").map((k) => [k, round1(first[k] as number)])),
      sincePrevMin: prevEnd != null ? Math.round((startMs - prevEnd) / 60000) : undefined,
      curve: [], water: { guesses: [] }, barDown: { guesses: [] },
    };
  }
  if (ctx.voltage != null) run.voltage = ctx.voltage;
  if (ctx.profile) run.profile = ctx.profile;
  let changed = false;
  const due = (g: HeatGuess[]) => !g.length || last.t - g[g.length - 1].t >= EVERY;

  // The curve, every 5 s
  const curve = (run.curve ??= []);
  if (!curve.length || last.t - (curve[curve.length - 1][0] ?? 0) >= CURVE_EVERY) {
    curve.push([Math.round(last.t), ...CURVE_COLS.map((k) => (typeof last[k] === "number" ? round1(last[k] as number) : null))]);
  }
  const before = run.lastT ?? 0;
  run.lastT = Math.round(last.t);
  if (ctx.machineReady && run.machineReadyAt == null) { run.machineReadyAt = run.lastT; changed = true; }

  // The water going in, and whether it was poured hot: from the dip it makes in the tube
  const wa = run.water;
  if (ctx.waitingForWater) { wa.tubeBefore = round1(last.temp); wa.addedAt = undefined; wa.tubeMinAfter = undefined; wa.kind = undefined; }
  else if (wa.tubeBefore != null && wa.addedAt == null) {
    // The water forecast starts over: what it said about the empty chamber doesn't count
    wa.addedAt = run.lastT; wa.tubeMinAfter = round1(last.temp); wa.guesses = []; wa.readyAt = undefined; changed = true;
  }
  else if (wa.addedAt != null && wa.kind == null) {
    wa.tubeMinAfter = round1(Math.min(wa.tubeMinAfter ?? last.temp, last.temp));
    if (run.lastT - wa.addedAt >= DIP_WINDOW) { wa.kind = wa.tubeMinAfter >= HOT_WATER_MIN ? "hot" : "cold"; changed = true; }
  }

  if (run.water.readyAt == null) {
    const left = waterLeft(samples, target, last.temp);
    if (left === 0) { run.water.readyAt = last.t; changed = true; }
    else if (left != null && due(run.water.guesses)) { run.water.guesses.push({ t: Math.round(last.t), at: Math.round(last.t + left) }); }
  }
  if (run.barDown.readyAt == null) {
    const s = barDownState(samples, target);
    if (s?.kind === "ready" || s?.kind === "settled") { run.barDown.readyAt = last.t; run.barDown.how = s.kind; changed = true; }
    else if (s?.kind === "eta" && due(run.barDown.guesses)) { run.barDown.guesses.push({ t: Math.round(last.t), at: Math.round(last.t + s.left) }); }
  }
  // Saved on news, and every 30 s so the curve isn't lost if the tablet sleeps
  if (changed || Math.floor(run.lastT / EVERY) !== Math.floor(before / EVERY)) saveRun(run);
  return run;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** How long before the real arrival a forecast was made, in buckets */
export const HEAT_BUCKETS = [
  { label: "more than 5 min out", min: 300, max: Infinity },
  { label: "2 to 5 min out", min: 120, max: 300 },
  { label: "under 2 min out", min: 0, max: 120 },
];

export interface HeatErrorRow { label: string; n: number; avg: number | null; worst: number | null }

/**
 * Forecast error by how far out it was made, in seconds: positive means it
 * said later than it really was (pessimistic), negative sooner (optimistic).
 */
export function heatErrors(runs: HeatRun[], which: "water" | "barDown", kind?: "hot" | "cold" | "unknown"): HeatErrorRow[] {
  if (kind) runs = runs.filter((r) => waterKind(r) === kind);
  return HEAT_BUCKETS.map((b) => {
    const errs: number[] = [];
    for (const r of runs) {
      const x = r[which];
      if (x.readyAt == null || (which === "barDown" && r.barDown.how === "settled")) continue;
      for (const g of x.guesses) {
        const out = x.readyAt - g.t;
        if (out >= b.min && out < b.max) errs.push(g.at - x.readyAt);
      }
    }
    if (!errs.length) return { label: b.label, n: 0, avg: null, worst: null };
    const avg = errs.reduce((a, c) => a + c, 0) / errs.length;
    const worst = errs.reduce((a, c) => (Math.abs(c) > Math.abs(a) ? c : a), 0);
    return { label: b.label, n: errs.length, avg, worst };
  });
}

/** How the water went in: hot, cold, or unknown (no water step seen, or the dip not finished) */
export function waterKind(r: HeatRun): "hot" | "cold" | "unknown" {
  return r.water.kind ?? "unknown";
}
