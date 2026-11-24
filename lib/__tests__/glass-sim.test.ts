import { describe, expect, it } from "vitest";
import { CREMA_REST, initialGlass, snapGlass, stepGlass, type GlassInput } from "../station/glass-sim";

const DT = 1 / 30;

/** Steps the glass for `seconds`, with the weight given by `weightAt(t)`. */
function run(state: ReturnType<typeof initialGlass>, seconds: number, inputAt: (t: number) => GlassInput) {
  let moving = true;
  for (let t = 0; t < seconds; t += DT) moving = stepGlass(state, inputAt(t), DT);
  return moving;
}

describe("espresso glass", () => {
  it("fills with the scale and is mostly cloudy while pouring", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 20, (t) => ({ weight: t * 2, target: 40, flow: 2, brewing: true }));
    expect(s.level).toBeCloseTo(40, 0);
    expect(s.pour).toBeGreaterThan(0.9);
    // Dark coffee has started to separate, but most of the glass is still crema-coloured
    expect(s.settled).toBeGreaterThan(1);
    expect(s.settled).toBeLessThan(s.level * 0.5);
  });

  it("settles to a thin crema on top and then stops moving", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 20, (t) => ({ weight: t * 2, target: 40, flow: 2, brewing: true }));
    const moving = run(s, 60, () => ({ weight: 40, target: 40, flow: 0, brewing: false }));
    expect(moving).toBe(false);
    expect(s.pour).toBeLessThan(0.01);
    expect(s.settled / s.level).toBeCloseTo(1 - CREMA_REST, 1);
  });

  it("cuts the stream at the target weight, even if drips keep adding weight", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 20, (t) => ({ weight: t * 2, target: 40, flow: 2, brewing: true }));
    // Still brewing, weight creeping past the target
    run(s, 4, (t) => ({ weight: 40 + t * 0.3, target: 40, flow: 0.3, brewing: true }));
    // Drops only, not a stream
    expect(s.pour).toBeLessThan(0.5);
    expect(s.level).toBeGreaterThan(40.5);
  });

  it("keeps pouring past any weight when there is no target", () => {
    const s = initialGlass({ weight: 0, target: null, flow: null, brewing: true });
    run(s, 25, (t) => ({ weight: t * 2, target: null, flow: 2, brewing: true }));
    expect(s.pour).toBeGreaterThan(0.9);
  });

  it("follows the last drips after the flow is cut, up to the scale's weight", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 18.5, (t) => ({ weight: t * 2, target: 40, flow: 2, brewing: true }));
    // Flow cut at 37 g; the scale creeps to 40 g over 3 s
    run(s, 3, (t) => ({ weight: 37, target: 40, flow: 0, brewing: false, scale: 37 + t }));
    expect(s.pour).toBeGreaterThan(0.05); // drops
    expect(s.pour).toBeLessThan(0.5);     // not a stream
    run(s, 3, () => ({ weight: 37, target: 40, flow: 0, brewing: false, scale: 40 }));
    expect(s.level).toBeCloseTo(40, 0);
    expect(s.pour).toBeLessThan(0.05);
  });

  it("keeps the coffee when the cup leaves the scale or something heavy lands on it", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 18.5, (t) => ({ weight: t * 2, target: 40, flow: 2, brewing: true }));
    run(s, 2, () => ({ weight: 37, target: 40, flow: 0, brewing: false, scale: -120 }));
    expect(s.level).toBeCloseTo(37, 0);
    run(s, 2, () => ({ weight: 37, target: 40, flow: 0, brewing: false, scale: 300 }));
    expect(s.level).toBeCloseTo(37, 0);
  });

  it("shows droplets on the basket before the first drop, not a stream", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    run(s, 5, () => ({ weight: 0, target: 40, flow: 0, brewing: true }));
    expect(s.beads).toBeGreaterThan(0.5);
    expect(s.pour).toBeLessThan(0.01);
  });

  it("opens on a finished shot already at rest", () => {
    const input = { weight: 38, target: 40, flow: null, brewing: false };
    const s = initialGlass(input);
    expect(s.level).toBe(38);
    expect(stepGlass(s, input, DT)).toBe(false);
  });

  it("ignores a negative scale reading", () => {
    const input = { weight: -3, target: 40, flow: null, brewing: false };
    const s = initialGlass(input);
    stepGlass(s, input, DT);
    expect(s.level).toBe(0);
  });

  it("snaps to the weight without motion", () => {
    const s = initialGlass({ weight: 0, target: 40, flow: null, brewing: true });
    snapGlass(s, { weight: 25, target: 40, flow: 2, brewing: true });
    expect(s.level).toBe(25);
    expect(s.pour).toBe(0);
  });
});
