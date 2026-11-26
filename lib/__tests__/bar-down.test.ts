import { describe, expect, it } from "vitest";
import { barDownAtStart, byGap } from "../bar-down";
import { estimateTds } from "../tds-estimate";
import type { ShotFrame } from "../types";

describe("Bar down at start", () => {
  it("reads the first sample's bar_down", () => {
    const frames = [{ sensors: { bar_down: 88.24 } }, { sensors: { bar_down: 92 } }] as unknown as ShotFrame[];
    expect(barDownAtStart(frames)).toBe(88.2);
    expect(barDownAtStart([])).toBeNull();
  });
  it("groups shots by gap to the target", () => {
    const g = byGap([{ gap: 1, face: "like", ey: 20 }, { gap: 3, face: "dislike" }, { gap: 8 }]);
    expect(g.map((x) => x.shots)).toEqual([1, 1, 1]);
    expect(g[0].liked).toBe(1);
    expect(g[1].rated).toBe(1);
  });
  it("the TDS estimate keeps only shots started at a similar Bar down, and says when it differs", () => {
    const ref = (barDown: number, ey: number) => ({ coffee: "X", dose: 20, ratio: 2, ey, barDown });
    const refs = [ref(92, 20), ref(92.5, 20), ref(91.8, 20), ref(85, 16), ref(85.5, 16), ref(84.8, 16)];
    const warm = estimateTds({ coffee: "X", dose: 20, ratio: 2, cupWeight: 40, barDown: 92 }, refs)!;
    expect(warm.ey).toBe(20);
    const cold = estimateTds({ coffee: "X", dose: 20, ratio: 2, cupWeight: 40, barDown: 85 }, refs)!;
    expect(cold.ey).toBe(16);
    const odd = estimateTds({ coffee: "X", dose: 20, ratio: 2, cupWeight: 40, barDown: 75 }, refs)!;
    expect(odd.basis).toBe("coffee");
    expect(odd.differs.join()).toMatch(/Bar down/);
  });
});
