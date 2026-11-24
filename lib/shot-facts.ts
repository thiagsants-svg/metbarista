/**
 * Shot facts: what the curves say about the puck, worked out from the shot's
 * own samples, no AI. Each fact says when it happened, in which stage, and
 * what it usually means for the next shot.
 *
 *  - channeling: water found a path. With the machine holding pressure the
 *    flow jumps; holding flow, the pressure collapses.
 *  - choked: after the first drops, the cup stopped filling under pressure.
 *  - weak puck: the shot never got near the pressure the profile asked for.
 *  - flow limit / pressure limit: the stage's safety limit took over (the
 *    machine switched to controlling the other one), a sign the grind was
 *    too coarse or too fine for that stage.
 *
 * Idea from the "shot facts" in Metic (hessius/MeticAI); rules and thresholds
 * are our own, tuned on real shots.
 */

import type { ShotFrame, ShotSetpoints } from "./types";

export type FactKind = "channeling" | "choked" | "weak" | "flowLimit" | "pressureLimit";

export interface ShotFact {
  kind: FactKind;
  /** ms since the shot started */
  at: number;
  stage: string | null;
  /** What happened, with numbers */
  detail: string;
}

export const FACT_LABEL: Record<FactKind, string> = {
  channeling: "Channeling",
  choked: "Choked",
  weak: "Weak puck",
  flowLimit: "Flow limit hit",
  pressureLimit: "Pressure limit hit",
};

/** What it usually means for the next shot */
export const FACT_TIP: Record<FactKind, string> = {
  channeling: "Check distribution and tamping; a slightly coarser grind can help.",
  choked: "Grind coarser.",
  weak: "Grind finer, or a little more coffee.",
  flowLimit: "The puck let water through too easily: grind finer.",
  pressureLimit: "The puck held the water back: grind coarser.",
};

/** The target the machine is following: only the one it's controlling, the other is a limit */
export function activeTargets(sp: ShotSetpoints | undefined): { pTarget: number | null; fTarget: number | null } {
  return {
    pTarget: sp?.active === "pressure" && typeof sp.pressure === "number" ? sp.pressure : null,
    fTarget: sp?.active === "flow" && typeof sp.flow === "number" ? sp.flow : null,
  };
}

/** Grams in the cup that count as "the first drops" */
const FIRST_DRIP_G = 2;
/** Ignore the first moments of a stage: the machine is moving to the new target */
const STAGE_SETTLE_MS = 2000;
/** Channeling: how quick and how big the jump must be */
const JUMP_MIN_MS = 700;
const JUMP_MAX_MS = 1500;
const FLOW_JUMP = 1.5; // ml/s, at held pressure
const PRESSURE_DROP = 1.5; // bar, at held flow
/** Choked: this long with almost nothing in the cup, under pressure */
const CHOKE_MS = 6000;
const CHOKE_G = 0.5;
const CHOKE_BAR = 4;
/** Weak: the peak stayed under this share of the pressure asked for */
const WEAK_SHARE = 0.8;
const WEAK_MIN_TARGET = 5;
/** Above this a pressure target is a placeholder, not a real target */
const MAX_REAL_BAR = 15;
/** Stages that fill or soak the puck: their limits are part of the design */
const PREP_STAGE = /fill|bloom|soak|infus|wet|satur|landing|purge/i;
/** Limits: on the limit this long after the first drops */
const LIMIT_MS = 2000;

interface Sample { t: number; p: number; f: number; w: number; stage: string; mode: "pressure" | "flow"; spP: number | null; spF: number | null }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v: number, d = 1) => v.toFixed(d);
const sec = (ms: number) => `${Math.round(ms / 1000)} s`;

/** The samples while the machine was extracting (following a target), in order */
function samples(frames: ShotFrame[]): Sample[] {
  const out: Sample[] = [];
  for (const f of frames) {
    const sp = f.shot?.setpoints;
    const mode = sp?.active;
    if (mode !== "pressure" && mode !== "flow") continue;
    const p = num(f.shot?.pressure), fl = num(f.shot?.flow), w = num(f.shot?.weight);
    if (p == null || fl == null || w == null) continue;
    out.push({ t: f.time, p, f: fl, w, stage: f.status ?? "", mode, spP: num(sp?.pressure), spF: num(sp?.flow) });
  }
  return out;
}

export function shotFacts(frames: ShotFrame[], stages: { name: string; type: string }[] = []): ShotFact[] {
  const s = samples(frames);
  if (s.length < 20) return [];
  const facts: ShotFact[] = [];
  const firstDrip = s.find((x) => x.w >= FIRST_DRIP_G)?.t ?? Infinity;
  const stageStart = new Map<string, number>();
  for (const x of s) if (!stageStart.has(x.stage)) stageStart.set(x.stage, x.t);
  const typeOf = (name: string) => stages.find((st) => st.name === name)?.type;

  // Channeling: a quick jump with the machine's target steady, once per stage
  const flagged = new Set<string>();
  for (let i = 0; i < s.length; i++) {
    const a = s[i];
    if (a.t < firstDrip || flagged.has(a.stage) || a.t - (stageStart.get(a.stage) ?? 0) < STAGE_SETTLE_MS) continue;
    for (let j = i + 1; j < s.length && s[j].t - a.t <= JUMP_MAX_MS; j++) {
      const b = s[j];
      if (b.stage !== a.stage || b.mode !== a.mode) break;
      if (b.t - a.t < JUMP_MIN_MS) continue;
      const steady = a.mode === "pressure"
        ? a.spP != null && b.spP != null && Math.abs(b.spP - a.spP) < 0.3
        : a.spF != null && b.spF != null && Math.abs(b.spF - a.spF) < 0.3;
      if (!steady) continue;
      const dp = b.p - a.p, df = b.f - a.f;
      if (a.mode === "pressure" && a.p >= 4 && a.f >= 0.5 && df >= FLOW_JUMP && dp <= 0.3) {
        facts.push({ kind: "channeling", at: a.t, stage: a.stage, detail: `Flow jumped ${fmt(a.f)} → ${fmt(b.f)} ml/s in ${fmt((b.t - a.t) / 1000)} s at ${fmt(a.p)} bar` });
        flagged.add(a.stage);
        break;
      }
      if (a.mode === "flow" && dp <= -PRESSURE_DROP && Math.abs(df) < 0.5) {
        facts.push({ kind: "channeling", at: a.t, stage: a.stage, detail: `Pressure fell ${fmt(a.p)} → ${fmt(b.p)} bar in ${fmt((b.t - a.t) / 1000)} s at ${fmt(a.f)} ml/s` });
        flagged.add(a.stage);
        break;
      }
    }
  }

  // Choked: after the first drops, a long stretch with the cup not filling under pressure
  for (let i = 0, j = 0; i < s.length; i++) {
    if (s[i].t < firstDrip) continue;
    while (j < s.length && s[j].t - s[i].t < CHOKE_MS) j++;
    if (j >= s.length) break;
    const span = s.slice(i, j + 1);
    const gained = s[j].w - s[i].w;
    const avgP = span.reduce((n, x) => n + x.p, 0) / span.length;
    // Water not moving either (if the pump flows but the cup doesn't fill, it's the scale or the cup)
    const avgF = span.reduce((n, x) => n + x.f, 0) / span.length;
    if (gained < CHOKE_G && avgP >= CHOKE_BAR && avgF < 0.6) {
      facts.push({ kind: "choked", at: s[i].t, stage: s[i].stage, detail: `Only ${fmt(Math.max(0, gained))} g in ${sec(s[j].t - s[i].t)} at ${fmt(avgP)} bar` });
      break;
    }
  }

  // Weak puck: never near the pressure asked for
  const asked = Math.max(0, ...s.filter((x) => x.spP != null && x.spP <= MAX_REAL_BAR && (x.mode === "pressure" || typeOf(x.stage) === "pressure")).map((x) => x.spP!));
  const peak = Math.max(...s.map((x) => x.p));
  // Only for a real shot: some pressure and coffee in the cup (not an aborted one)
  const weak = asked >= WEAK_MIN_TARGET && peak >= 1 && firstDrip < Infinity && peak < asked * WEAK_SHARE;
  if (weak) facts.push({ kind: "weak", at: s.find((x) => x.p === peak)!.t, stage: null, detail: `Peaked at ${fmt(peak)} bar; the profile asked for ${fmt(asked)} bar` });

  // A stage's limit took over after the first drops
  const onLimit = new Map<string, { kind: FactKind; ms: number; at: number; value: number | null }>();
  for (let i = 1; i < s.length; i++) {
    const x = s[i], prev = s[i - 1];
    if (x.t < firstDrip || prev.stage !== x.stage || PREP_STAGE.test(x.stage)) continue;
    const type = typeOf(x.stage);
    const kind: FactKind | null = type === "pressure" && x.mode === "flow" ? "flowLimit" : type === "flow" && x.mode === "pressure" ? "pressureLimit" : null;
    if (!kind) continue;
    const cur = onLimit.get(x.stage) ?? { kind, ms: 0, at: x.t, value: kind === "flowLimit" ? x.spF : x.spP };
    cur.ms += x.t - prev.t;
    onLimit.set(x.stage, cur);
  }
  for (const [stage, l] of onLimit) {
    if (l.ms < LIMIT_MS || (weak && l.kind === "flowLimit")) continue;
    const what = l.kind === "flowLimit" ? `flow limit${l.value != null ? ` (${fmt(l.value)} ml/s)` : ""}` : `pressure limit${l.value != null ? ` (${fmt(l.value)} bar)` : ""}`;
    facts.push({ kind: l.kind, at: l.at, stage, detail: `On the ${what} for ${sec(l.ms)}` });
  }

  return facts.sort((a, b) => a.at - b.at);
}
