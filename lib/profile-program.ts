/**
 * Plain-English description of a profile's stages ("program"): what each
 * stage controls, when it ends and its limits. Variables ("$pressure_1")
 * are resolved from the profile's own variables.
 */

import type { Profile, ProfileStage } from "./types";

export interface StageProgram {
  name: string;
  /** e.g. "Pressure 9 → 3 bar over 55 s" */
  control: string;
  /** e.g. ["flow ≥ 2.8 ml/s", "after 55 s"] — the stage ends at the first one met */
  exits: string[];
  /** e.g. ["flow max 8 ml/s"] */
  limits: string[];
}

const UNITS: Record<string, string> = {
  pressure: "bar",
  flow: "ml/s",
  power: "%",
  weight: "g",
  time: "s",
  piston_position: "mm",
  temperature: "°C",
};

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}

/** Resolves "$key" against the profile's variables; returns null if unknown. */
function resolve(profile: Profile, v: number | string): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.startsWith("$")) {
    const found = profile.variables?.find((x) => x.key === v.slice(1));
    return typeof found?.value === "number" ? found.value : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function describeStage(profile: Profile, st: ProfileStage): StageProgram {
  const unit = UNITS[st.type] ?? "";
  const label = st.type.charAt(0).toUpperCase() + st.type.slice(1);
  const pts = (st.dynamics?.points ?? [])
    .map(([x, y]) => [resolve(profile, x), resolve(profile, y)] as const)
    .filter((p): p is readonly [number, number] => p[0] != null && p[1] != null);

  let control = label;
  if (pts.length === 1 || (pts.length > 1 && pts.every((p) => p[1] === pts[0][1]))) {
    control = `${label} ${num(pts[0][1])} ${unit}`;
  } else if (pts.length > 1) {
    const over = st.dynamics?.over ?? "time";
    const span = pts[pts.length - 1][0] - pts[0][0];
    const values = pts.map((p) => num(p[1])).join(" → ");
    control = `${label} ${values} ${unit} over ${num(span)} ${UNITS[over] ?? over}`;
  }

  const exits = (st.exit_triggers ?? []).map((e) => {
    const v = resolve(profile, e.value);
    const u = UNITS[e.type] ?? "";
    if (v == null) return e.type;
    if (e.type === "time") return `after ${num(v)} s`;
    const cmp = e.comparison === "<=" ? "≤" : "≥";
    return `${e.type.replace("_", " ")} ${cmp} ${num(v)} ${u}`.trim();
  });

  const limits = (st.limits ?? []).map((l) => {
    const v = resolve(profile, l.value);
    return `${l.type.replace("_", " ")} max ${v == null ? "?" : num(v)} ${UNITS[l.type] ?? ""}`.trim();
  });

  // No exit trigger: the stage runs until the shot stops (target weight)
  if (!exits.length) exits.push("at the target weight");
  return { name: st.name, control, exits, limits };
}

export function profileProgram(profile: Profile | null | undefined): StageProgram[] {
  return (profile?.stages ?? []).map((st) => describeStage(profile!, st));
}

/** The running stage and the one after it, matched by the stage name the machine reports. */
export function currentAndNext(profile: Profile | null | undefined, stageName: string | null | undefined) {
  const program = profileProgram(profile);
  const i = stageName ? program.findIndex((s) => s.name.toLowerCase() === stageName.toLowerCase()) : -1;
  return {
    current: i >= 0 ? program[i] : null,
    next: i >= 0 ? program[i + 1] ?? null : null,
    index: i,
    total: program.length,
  };
}
