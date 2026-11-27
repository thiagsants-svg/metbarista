/**
 * Simulated LRv2-style shot for previewing the Estação chart without the
 * machine (open /station/?demo). Values are rough, for layout only.
 */

import type { ShotPoint } from "@/components/shot-charts";
import type { Profile } from "@/lib/types";

const STAGES: { name: string; until: number }[] = [
  { name: "Fill start", until: 2 },
  { name: "Fill", until: 9 },
  { name: "Infuse", until: 21 },
  { name: "Pressure Up", until: 29 },
  { name: "Pressure Decline", until: 48 },
];

export function demoShot(): ShotPoint[] {
  const pts: ShotPoint[] = [];
  let weight = 0;
  for (let i = 0; i <= 40 * 5; i++) {
    const t = i / 5; // s
    const stage = STAGES.find((s) => t <= s.until)?.name ?? "Pressure Decline";
    let pressure: number, flow: number;
    if (t < 2) { pressure = t; flow = 6 + t; }
    else if (t < 9) { pressure = 2 + (t - 2) * 0.2; flow = Math.max(0.3, 8 - (t - 2) * 1.3); }
    else if (t < 21) { pressure = 3; flow = 0.3; }
    else if (t < 29) { pressure = Math.min(9, 3 + (t - 21) * 2); flow = t < 23 ? 5 - (t - 21) * 2 : 0.6 + (t - 23) * 0.05; }
    else { pressure = 9 - (t - 29) * 0.09; flow = 1.0 + (t - 29) * 0.03; }
    const grav = t > 12 ? Math.min(flow * 0.9, 2.2) : 0;
    weight += grav / 5;
    const pTarget = t < 9 ? 2 : t < 21 ? 3 : t < 29 ? 9 : 9 - (t - 29) * 0.11;
    pts.push({
      t: t * 1000, pressure, flow, grav, weight: weight > 0.1 ? weight : null,
      temp: 94 - Math.min(2, t * 0.05) + Math.sin(t / 3) * 0.2, stage,
      pTarget, fTarget: null,
      barUp: 95 - Math.min(5, t * 0.15), barMidUp: 93.5 - Math.min(6, t * 0.18),
      barMidDown: 92 - Math.min(7, t * 0.2), barDown: 90 - Math.min(8, t * 0.22),
      ext1: 88 - t * 0.05, ext2: 87 - t * 0.04,
    });
  }
  // Scale the cup weight so the shot ends right at a 40 g target
  const final = pts[pts.length - 1].weight ?? 1;
  for (const p of pts) if (p.weight != null) p.weight = (p.weight * 40) / final;
  return pts;
}

/** The profile behind the demo shot, so the stage log has exits to read */
export const DEMO_PROFILE = {
  id: "demo", name: "Demo LRv2", author: "", author_id: "", previous_authors: [], display: {},
  temperature: 94, final_weight: 40, variables: [],
  stages: [
    { name: "Fill start", key: "a", type: "flow", dynamics: { points: [[0, 6]], over: "time" },
      exit_triggers: [{ type: "time", value: 2, relative: true }] },
    { name: "Fill", key: "b", type: "flow", dynamics: { points: [[0, 8]], over: "time" },
      exit_triggers: [{ type: "pressure", value: 3.2, comparison: ">=" }, { type: "time", value: 15, relative: true }],
      limits: [{ type: "pressure", value: 3.5 }] },
    { name: "Infuse", key: "c", type: "pressure", dynamics: { points: [[0, 3]], over: "time" },
      exit_triggers: [{ type: "weight", value: 4, comparison: ">=" }, { type: "time", value: 12, relative: true }] },
    { name: "Pressure Up", key: "d", type: "pressure", dynamics: { points: [[0, 3], [8, 9]], over: "time" },
      exit_triggers: [{ type: "time", value: 8, relative: true }] },
    { name: "Pressure Decline", key: "e", type: "pressure", dynamics: { points: [[0, 9], [30, 6]], over: "time" },
      exit_triggers: [] },
  ],
} as unknown as Profile;
