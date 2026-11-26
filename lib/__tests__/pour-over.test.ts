import { describe, expect, it } from "vitest";
import { brewerLifted, guide, newDetector, scaleRecipe, step, DEFAULT_RECIPES, type Sample } from "../pour-over";

/** 10 Hz samples: pour 3 g/s from 1 s to 11 s (30 g), rest, pour again 20 s–30 s (+60 g) */
function brew(): Sample[] {
  const out: Sample[] = [];
  let w = 0;
  for (let i = 0; i <= 450; i++) {
    const t = i / 10;
    if (t > 1 && t <= 11) w += 0.3;
    else if (t > 20 && t <= 30) w += 0.6;
    out.push({ t: 100 + t, w: w + ((i % 3) - 1) * 0.1 });
  }
  return out;
}

describe("pour detection", () => {
  it("finds two pours with their water and times", () => {
    let d = newDetector();
    for (const s of brew()) d = step(d, s);
    expect(d.pours).toHaveLength(2);
    expect(d.t0).toBeGreaterThan(100.5);
    expect(d.t0).toBeLessThan(101.6);
    const [a, b] = d.pours;
    expect(a.to).toBeGreaterThan(28);
    expect(a.end! - a.start).toBeGreaterThan(8);
    expect(b.start).toBeGreaterThan(18);
    expect(b.to).toBeGreaterThan(88);
    expect(d.pouring).toBe(false);
  });
  it("ignores a still scale and small bumps", () => {
    let d = newDetector();
    for (let i = 0; i < 100; i++) d = step(d, { t: i / 10, w: i === 50 ? 1.5 : 0 });
    expect(d.pours).toHaveLength(0);
  });
});

describe("recipes", () => {
  it("scales the water to the dose and guides pour by pour", () => {
    const r = scaleRecipe(DEFAULT_RECIPES[0], 20);
    expect(r.pours.map((p) => p.grams)).toEqual([60, 140, 120]);
    expect(guide(r, 5, 10)).toMatchObject({ index: 0, phase: "pour", stopAt: 60 });
    expect(guide(r, 20, 60)).toMatchObject({ index: 1, phase: "wait", stopAt: 200 });
    expect(guide(r, 50, 120)).toMatchObject({ index: 1, phase: "pour" });
    expect(guide(r, 200, 320).phase).toBe("done");
  });
  it("sees the brewer lifted", () => {
    expect(brewerLifted(-150, 250, 120, 15)).toBe(true);
    expect(brewerLifted(240, 250, 120, 15)).toBe(false);
  });
});
