import { describe, expect, it } from "vitest";
import { applyPlan, grindLabel, grindOptions, grindTarget, planLines } from "../next-plan";

const motto = { dose: 20, ratio: 2.5, temperature: 94, grinder: "Motto 80", grindUm: 135, feed: 65, rpm: 1000 };
const dial = { dose: 18, ratio: 2, temperature: 93, grinder: "Niche Zero", grindSetting: 2.5 };

describe("grind suggestions (reminder only)", () => {
  it("sour suggests finer, bitter coarser, balanced nothing", () => {
    expect(grindOptions("sour", motto)).toEqual([-5, -10]);
    expect(grindOptions("bitter", motto)).toEqual([5, 10]);
    expect(grindOptions("balanced", motto)).toEqual([]);
  });

  it("dial grinders move in half steps", () => {
    expect(grindOptions("sour", dial)).toEqual([-0.5, -1]);
    expect(grindLabel(-0.5, dial)).toBe("0.5 finer");
    expect(grindTarget(dial, -0.5)).toBe("grind 2");
  });

  it("labels and targets", () => {
    expect(grindLabel(-5, motto)).toBe("5 µm finer");
    expect(grindTarget(motto, -5)).toBe("130 µm");
    expect(grindTarget(motto, undefined)).toBeNull();
  });
});

describe("applyPlan", () => {
  it("sets temperature and ratio, never the grind", () => {
    expect(applyPlan(motto, { temperature: 95, ratio: 3 })).toMatchObject({ temperature: 95, ratio: 3, grindUm: 135, dose: 20 });
  });

  it("leaves what the plan doesn't change", () => {
    expect(applyPlan(motto, {})).toEqual(motto);
  });
});

describe("planLines", () => {
  it("shows each change against the last shot", () => {
    expect(planLines(motto, { taste: "sour", temperature: 95, ratio: 3, grindDelta: -5 })).toEqual([
      "94 → 95 °C", "1:2.5 → 1:3", "5 µm finer → 130 µm",
    ]);
  });

  it("is empty when nothing changes", () => {
    expect(planLines(motto, { taste: "balanced" })).toEqual([]);
    expect(planLines(motto, { taste: "sour", temperature: 94 })).toEqual([]);
  });
});
