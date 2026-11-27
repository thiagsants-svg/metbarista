/**
 * Stage by stage: what each stage of the profile did in this shot (how long,
 * grams in the cup, pressure and flow) and how it ended: its goal reached,
 * time ran out, the shot's final weight, or cut short. Plus the
 * pre-infusion (the stages that fill and soak the puck) as a whole.
 *
 * Idea from Metic (hessius/MeticAI); our own code and tolerances.
 */

import type { ExitTrigger, Profile, ShotFrame } from "./types";
import { cupWeight } from "./cup-weight";

/** Stages that fill or soak the puck */
export const PREP_STAGE = /fill|bloom|soak|infus|wet|satur|landing|preinf/i;

export type StageEnd =
  | { kind: "goal"; trigger: string; got?: number; unit?: string }
  | { kind: "time"; seconds: number; got?: number }
  | { kind: "final"; grams: number }
  | { kind: "cut" }
  | { kind: "last" };

export interface StageRow {
  name: string;
  /** "pressure" | "flow" | … from the profile */
  type: string | null;
  start: number;
  end: number;
  grams: number;
  avgP: number;
  maxP: number;
  avgF: number;
  maxF: number;
  /** Share of the stage with its limit in control (the machine switched to the other target) */
  onLimit: number;
  ended: StageEnd;
}

export interface StageSummary {
  stages: StageRow[];
  /** The stages that fill and soak the puck, before the extraction */
  preinfusion: { seconds: number; share: number; grams: number } | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TOL: Record<string, number> = { time: 0.3, weight: 0.5, pressure: 0.2, flow: 0.2, piston_position: 1 };
const UNIT: Record<string, string> = { time: "s", weight: "g", pressure: "bar", flow: "ml/s", piston_position: "mm" };

/** A trigger's value: a number, or a profile variable ("$dose") */
function triggerValue(t: ExitTrigger, profile?: Profile): number | null {
  if (typeof t.value === "number") return t.value;
  const key = String(t.value).replace(/^\$/, "");
  return num(profile?.variables?.find((v) => v.key === key)?.value);
}

export function stageSummary(frames: ShotFrame[], profile?: Profile): StageSummary {
  // The shot's own samples (the machine following a target), grouped by stage in order
  const runs: { name: string; f: ShotFrame[] }[] = [];
  for (const fr of frames) {
    const mode = fr.shot?.setpoints?.active;
    if ((mode !== "pressure" && mode !== "flow") || !fr.status || /retract|idle|purge|home/i.test(fr.status)) continue;
    const last = runs.at(-1);
    if (last && last.name === fr.status) last.f.push(fr);
    else runs.push({ name: fr.status, f: [fr] });
  }
  if (!runs.length) return { stages: [], preinfusion: null };

  const shotStart = runs[0].f[0].time;
  const shotEnd = runs.at(-1)!.f.at(-1)!.time;
  const finalWeight = num(profile?.final_weight);
  // What reached the cup, the last drops included (the machine stops a little early, expecting them)
  const cup = cupWeight(frames);

  const stages: StageRow[] = runs.map((run, i) => {
    const st = profile?.stages?.find((s) => s.name === run.name);
    const f = run.f;
    const start = f[0].time;
    const end = i + 1 < runs.length ? runs[i + 1].f[0].time : f.at(-1)!.time;
    const p = f.map((x) => num(x.shot.pressure) ?? 0);
    const fl = f.map((x) => num(x.shot.flow) ?? 0);
    const w0 = num(f[0].shot.weight) ?? 0;
    const w1 = num((runs[i + 1]?.f[0] ?? f.at(-1)!).shot.weight) ?? w0;
    const type = st?.type ?? null;
    const limited = type ? f.filter((x) => x.shot.setpoints?.active && x.shot.setpoints.active !== type).length : 0;

    // How it ended: the trigger met at its last sample, or just after (the machine checks its own,
    // faster readings; the recorded ones lag a little)
    const lastF = f.at(-1)!;
    const probes = [lastF, ...(runs[i + 1]?.f.filter((x) => x.time - lastF.time <= 800) ?? [])];
    const actualAt = (t: ExitTrigger, at: ShotFrame): number | null => {
      switch (t.type) {
        case "time": return (at.time - (t.relative ? start : shotStart)) / 1000;
        case "weight": return (num(at.shot.weight) ?? 0) - (t.relative ? w0 : 0);
        case "pressure": return num(at.shot.pressure);
        case "flow": return num(at.shot.flow);
        case "piston_position": return num(at.sensors?.motor_position);
        default: return null;
      }
    };
    /** The value each met trigger read when it was met */
    const gotAt = new Map<ExitTrigger, number>();
    const met = (st?.exit_triggers ?? []).filter((t) => {
      const want = triggerValue(t, profile);
      if (want == null) return false;
      const tol = TOL[t.type] ?? 0;
      return probes.some((at) => {
        const got = actualAt(t, at);
        const ok = got != null && (t.comparison === "<=" ? got <= want + tol : got >= want - tol);
        if (ok) gotAt.set(t, got);
        return ok;
      });
    });
    const goal = met.find((t) => t.type !== "time");
    const timeUp = met.find((t) => t.type === "time");
    const isLast = i === runs.length - 1;
    let ended: StageEnd;
    if (goal) {
      const v = triggerValue(goal, profile)!;
      ended = { kind: "goal", trigger: `${goal.type === "piston_position" ? "piston" : goal.type} ${goal.comparison === "<=" ? "≤" : "≥"} ${v} ${UNIT[goal.type] ?? ""}`.trim(),
        got: gotAt.get(goal), unit: UNIT[goal.type] ?? "" };
    } else if (timeUp) ended = { kind: "time", seconds: triggerValue(timeUp, profile)!, got: gotAt.get(timeUp) };
    else if (isLast && finalWeight != null && cup >= finalWeight - 1.5) ended = { kind: "final", grams: finalWeight };
    else if (isLast) ended = { kind: "last" };
    else ended = { kind: "cut" };

    return {
      name: run.name, type, start, end, grams: Math.max(0, w1 - w0),
      avgP: p.reduce((a, b) => a + b, 0) / p.length, maxP: Math.max(...p),
      avgF: fl.reduce((a, b) => a + b, 0) / fl.length, maxF: Math.max(...fl),
      onLimit: limited / f.length, ended,
    };
  });

  // Pre-infusion: the leading stages that fill and soak
  const prep: StageRow[] = [];
  for (const s of stages) { if (PREP_STAGE.test(s.name)) prep.push(s); else break; }
  const total = shotEnd - shotStart;
  const preinfusion = prep.length && total > 0
    ? { seconds: (prep.at(-1)!.end - prep[0].start) / 1000, share: (prep.at(-1)!.end - prep[0].start) / total, grams: prep.reduce((g, s) => g + s.grams, 0) }
    : null;

  return { stages, preinfusion };
}

/** One line on how a stage ended */
export function endText(e: StageEnd): string {
  switch (e.kind) {
    case "goal": return `Goal reached: ${e.trigger}`;
    case "time": return `Time ran out (${e.seconds} s)`;
    case "final": return `Shot stopped at ${e.grams} g`;
    case "cut": return "Ended before its triggers";
    case "last": return "Last stage";
  }
}
