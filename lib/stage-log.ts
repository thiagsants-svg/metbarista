/**
 * The shot's stage log, live, for the console under the Station chart: when
 * each stage started (what it controls, its exits and limits), when it ended
 * and which exit ended it (with the value read), plus, for the running stage,
 * how far each exit is. Same reading of the triggers as the shot page
 * (stage-summary), from the Station's samples.
 */

import type { ShotPoint } from "@/components/shot-charts";
import type { ExitTrigger, Profile, ShotFrame } from "./types";
import { stageSummary, type StageEnd } from "./stage-summary";
import { currentAndNext } from "./profile-program";

export type LogKind = "start" | "stage" | "exit" | "skip" | "cut" | "end";

export interface LogEvent {
  /** s since the shot started */
  t: number;
  kind: LogKind;
  text: string;
  /** Second line: exits and limits of a stage */
  detail?: string;
}

export interface LiveExit {
  label: string;
  now: number;
  want: number;
  unit: string;
  /** 0–1: how close it is */
  share: number;
}

export interface LiveStage {
  name: string;
  /** s in this stage */
  elapsed: number;
  exits: LiveExit[];
  next: string | null;
}

const UNIT: Record<string, string> = { time: "s", weight: "g", pressure: "bar", flow: "ml/s", piston_position: "mm" };
const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");

function wanted(t: ExitTrigger, profile: Profile | null | undefined): number | null {
  if (typeof t.value === "number") return t.value;
  const key = String(t.value).replace(/^\$/, "");
  const v = profile?.variables?.find((x) => x.key === key)?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function endReason(e: StageEnd, skipped: boolean): { kind: LogKind; text: string } {
  switch (e.kind) {
    case "goal": return { kind: "exit", text: `${e.trigger}${e.got != null ? `  (read ${r1(e.got)} ${e.unit ?? ""})`.trimEnd() : ""}` };
    case "time": return { kind: "exit", text: `after ${e.seconds} s` };
    case "final": return { kind: "end", text: `final weight ${e.grams} g` };
    case "last": return { kind: "end", text: "shot stopped" };
    case "cut": return skipped ? { kind: "skip", text: "skipped by you" } : { kind: "cut", text: "stopped before its exits" };
  }
}

/** The Station's samples in the machine's history shape (enough for stageSummary) */
function toFrames(points: ShotPoint[]): ShotFrame[] {
  return points.filter((p) => p.stage).map((p) => ({
    time: p.t,
    profile_time: p.t,
    status: p.stage!,
    shot: {
      pressure: p.pressure ?? 0, flow: p.flow ?? 0, weight: p.weight ?? 0, gravimetric_flow: p.grav ?? 0,
      setpoints: { active: p.fTarget != null && p.pTarget == null ? "flow" : "pressure" },
    },
  } as ShotFrame));
}

/**
 * @param skips shot-clock times (ms) when Skip stage was tapped here
 */
export function stageLog(points: ShotPoint[], profile: Profile | null | undefined, running: boolean, skips: number[] = []):
  { events: LogEvent[]; live: LiveStage | null } {
  const frames = toFrames(points);
  if (!frames.length) return { events: [], live: null };
  const t0 = frames[0].time;
  const { stages } = stageSummary(frames, profile ?? undefined);
  const events: LogEvent[] = [];
  if (profile?.name) events.push({ t: 0, kind: "start", text: `${profile.name} · ${profile.stages?.length ?? 0} stages` });
  let live: LiveStage | null = null;

  stages.forEach((s, i) => {
    const prog = currentAndNext(profile, s.name);
    const p = prog.current;
    events.push({
      t: (s.start - t0) / 1000, kind: "stage",
      text: `${s.name}${p ? ` · ${p.control}` : ""}`,
      detail: p ? `exit ${p.exits.join(" | ")}${p.limits.length ? ` · limit ${p.limits.join(", ").replace(/ max /g, " ")}` : ""}` : undefined,
    });
    const isLive = running && i === stages.length - 1;
    if (!isLive) {
      const skipped = skips.some((k) => Math.abs(k - s.end) < 2500);
      const why = endReason(s.ended, skipped);
      events.push({ t: (s.end - t0) / 1000, kind: why.kind, text: `${s.name} ← ${why.text}` });
      return;
    }
    // Running: how far each exit is, from the last sample
    const st = profile?.stages?.find((x) => x.name === s.name);
    const last = points[points.length - 1];
    const first = points.find((x) => x.t >= s.start) ?? last;
    const exits: LiveExit[] = [];
    for (const tr of st?.exit_triggers ?? []) {
      const w = wanted(tr, profile);
      if (w == null) continue;
      let now: number | null = null;
      switch (tr.type) {
        case "time": now = (last.t - (tr.relative ? s.start : t0)) / 1000; break;
        case "weight": now = (last.weight ?? 0) - (tr.relative ? first.weight ?? 0 : 0); break;
        case "pressure": now = last.pressure; break;
        case "flow": now = last.flow; break;
      }
      if (now == null) continue;
      const down = tr.comparison === "<=";
      const share = down
        ? (now <= w ? 1 : Math.max(0, Math.min(1, w / Math.max(now, 0.01))))
        : Math.max(0, Math.min(1, now / (w || 1)));
      exits.push({ label: `${tr.type.replace("_", " ")} ${down ? "≤" : "≥"} ${r1(w)} ${UNIT[tr.type] ?? ""}`.trim(), now, want: w, unit: UNIT[tr.type] ?? "", share });
    }
    live = { name: s.name, elapsed: (last.t - s.start) / 1000, exits, next: prog.next?.name ?? null };
  });
  return { events, live };
}
