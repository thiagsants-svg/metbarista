import { describe, expect, it } from "vitest";
import { applyPlan, grindLabel, grindNow, grindTarget, planLines } from "../next-plan";

const motto = { dose: 20, ratio: 2.5, temperature: 94, grinder: "Motto 80", grindUm: 135, feed: 65, rpm: 1000 };
const dial = { dose: 18, ratio: 2, temperature: 93, grinder: "Niche Zero", grindSetting: 2.5 };

describe("grind (reminder only)", () => {
  it("finer or coarser than the shot's grind, no amount", () => {
    expect(grindNow(motto)).toBe("135 µm");
    expect(grindNow(dial)).toBe("2.5");
    expect(grindNow({ dose: 18 })).toBeNull();
    expect(planLines(motto, { taste: "sour", grind: "finer" })).toEqual(["Grind finer than 135 µm"]);
    expect(planLines(dial, { taste: "bitter", grind: "coarser" })).toEqual(["Grind coarser than 2.5"]);
    expect(planLines({ dose: 18 }, { taste: "bitter", grind: "coarser" })).toEqual(["Grind coarser"]);
    // The grind saved with the plan wins: it's the shot that was tasted
    expect(planLines(motto, { taste: "sour", grind: "finer", grindWas: "140 µm" })).toEqual(["Grind finer than 140 µm"]);
  });

  it("older plans with a set change still read", () => {
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
