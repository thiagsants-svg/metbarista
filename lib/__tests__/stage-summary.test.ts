import { describe, expect, it } from "vitest";
import { endText, stageSummary } from "../stage-summary";
import type { Profile, ShotFrame } from "../types";

const frame = (ms: number, status: string, p: number, f: number, w: number, active = "pressure"): ShotFrame => ({
  time: ms, profile_time: ms, status,
  shot: { pressure: p, flow: f, weight: w, gravimetric_flow: 0, setpoints: { active, pressure: 9, flow: 8 } },
});

const profile = {
  final_weight: 36,
  variables: [{ key: "fill_bar", name: "Fill", type: "pressure", value: 1.5 }],
  stages: [
    { name: "Fill", type: "pressure", exit_triggers: [{ type: "pressure", value: "$fill_bar", comparison: ">=" }, { type: "time", value: 20, relative: true, comparison: ">=" }] },
    { name: "Infuse", type: "pressure", exit_triggers: [{ type: "time", value: 5, relative: true, comparison: ">=" }] },
    { name: "Extraction", type: "pressure", exit_triggers: [{ type: "time", value: 60, relative: true, comparison: ">=" }] },
  ],
} as unknown as Profile;

function shot(): ShotFrame[] {
  const out: ShotFrame[] = [];
  for (let t = 0; t <= 2000; t += 100) out.push(frame(t, "Fill", t / 1000 * 0.8, 6, 0, t < 1500 ? "flow" : "pressure"));
  for (let t = 2100; t <= 7000; t += 100) out.push(frame(t, "Infuse", 3, 0.5, (t - 2100) / 1000 * 0.4));
  for (let t = 7100; t <= 27000; t += 100) out.push(frame(t, "Extraction", 9, 1.6, 2 + (t - 7100) / 1000 * 1.7));
  out.push({ ...frame(27100, "retracting", 0, 0, 36.5), shot: { ...frame(0, "", 0, 0, 36.5).shot, setpoints: { active: null } } });
  return out;
}

describe("stage by stage", () => {
  const s = stageSummary(shot(), profile);

  it("splits the shot into its stages, without the retract", () => {
    expect(s.stages.map((x) => x.name)).toEqual(["Fill", "Infuse", "Extraction"]);
  });

  it("tells how each stage ended (variables resolved)", () => {
    expect(endText(s.stages[0].ended)).toBe("Goal reached: pressure ≥ 1.5 bar");
    expect(endText(s.stages[1].ended)).toBe("Time ran out (5 s)");
    expect(endText(s.stages[2].ended)).toBe("Shot stopped at 36 g");
  });

  it("measures the stage and the pre-infusion", () => {
    expect(s.stages[0].onLimit).toBeGreaterThan(0.6);
    expect(s.stages[2].maxP).toBe(9);
    expect(s.preinfusion!.seconds).toBeCloseTo(7.1, 1);
    expect(s.preinfusion!.grams).toBeCloseTo(2, 0);
  });
});
