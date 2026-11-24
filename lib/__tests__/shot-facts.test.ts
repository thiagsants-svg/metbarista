import { describe, expect, it } from "vitest";
import { activeTargets, shotFacts } from "../shot-facts";
import type { ShotFrame } from "../types";

type Mode = "pressure" | "flow";
/** A frame every 100 ms */
const frame = (i: number, stage: string, mode: Mode, p: number, f: number, w: number, spP: number, spF: number): ShotFrame => ({
  time: i * 100, profile_time: i * 100, status: stage,
  shot: { pressure: p, flow: f, weight: w, gravimetric_flow: 0, setpoints: { active: mode, pressure: spP, flow: spF } },
});

/** 30 s at 9 bar, 1.5 ml/s, cup filling 1.2 g/s after 5 s */
function steadyShot(over: (i: number, base: ShotFrame) => ShotFrame = (_, b) => b): ShotFrame[] {
  return Array.from({ length: 300 }, (_, i) => over(i, frame(i, "Extraction", "pressure", 9, 1.5, Math.max(0, (i - 50) * 0.12), 9, 8)));
}
const stages = [{ name: "Extraction", type: "pressure" }];

describe("shot facts", () => {
  it("a clean shot has none", () => {
    expect(shotFacts(steadyShot(), stages)).toEqual([]);
  });

  it("finds a sudden flow jump at held pressure (channeling)", () => {
    const shot = steadyShot((i, b) => (i >= 150 ? { ...b, shot: { ...b.shot, flow: 3.5 } } : b));
    const f = shotFacts(shot, stages);
    expect(f.map((x) => x.kind)).toEqual(["channeling"]);
    expect(f[0].at).toBeGreaterThanOrEqual(13_500);
    expect(f[0].at).toBeLessThan(15_000);
  });

  it("finds the cup not filling under pressure (choked)", () => {
    const shot = steadyShot((i, b) => (i >= 100 ? { ...b, shot: { ...b.shot, weight: 6, flow: 0.2 } } : b));
    expect(shotFacts(shot, stages).map((x) => x.kind)).toEqual(["choked"]);
  });

  it("finds a shot that never got near the pressure asked for (weak)", () => {
    const shot = steadyShot((i, b) => ({ ...b, shot: { ...b.shot, pressure: 5 } }));
    expect(shotFacts(shot, stages).map((x) => x.kind)).toEqual(["weak"]);
  });

  it("finds a stage's limit taking over, but not while filling", () => {
    const limited = steadyShot((i, b) => (i >= 100 && i < 140 ? { ...b, shot: { ...b.shot, setpoints: { active: "flow", pressure: 9, flow: 8 } } } : b));
    expect(shotFacts(limited, stages).map((x) => x.kind)).toEqual(["flowLimit"]);
    const filling = limited.map((x) => ({ ...x, status: "Fill" }));
    expect(shotFacts(filling, [{ name: "Fill", type: "pressure" }])).toEqual([]);
  });

  it("charts only the target the machine is following", () => {
    expect(activeTargets({ active: "pressure", pressure: 9, flow: 8 })).toEqual({ pTarget: 9, fTarget: null });
    expect(activeTargets({ active: "flow", pressure: 3, flow: 2 })).toEqual({ pTarget: null, fTarget: 2 });
    expect(activeTargets(undefined)).toEqual({ pTarget: null, fTarget: null });
  });
});
