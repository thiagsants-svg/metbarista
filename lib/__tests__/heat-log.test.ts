import { beforeEach, describe, expect, it } from "vitest";
import { barDownState, heatErrors, loadHeatRuns, stepHeatRun, waterLeft, type HeatRun, type HeatSample } from "../heat-log";

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { window: unknown }).window = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; },
  };
});

describe("heating forecast", () => {
  it("tells the water's seconds left from the climb", () => {
    const s: HeatSample[] = Array.from({ length: 31 }, (_, i) => ({ t: i, temp: 60 + i * 0.1 }));
    expect(waterLeft(s, 93, 63)).toBeCloseTo(300, 0);
    expect(waterLeft(s, 93, 92.8)).toBe(0);
  });
  it("tells the Bar down's state", () => {
    const climb: HeatSample[] = Array.from({ length: 61 }, (_, i) => ({ t: i, temp: 90, barDown: 70 + i * 0.05 }));
    const st = barDownState(climb, 93);
    expect(st?.kind).toBe("eta");
    expect(st && st.kind === "eta" ? st.left : 0).toBeCloseTo((91 - 73) / 0.05, 0);
    expect(barDownState([{ t: 0, temp: 90, barDown: 91.5 }], 93)?.kind).toBe("ready");
  });
  it("logs a forecast every 30 s and the real arrival, then scores it", () => {
    let run: HeatRun | null = null;
    const samples: HeatSample[] = [];
    // The Bar down climbs fast, then slows down near the target: the linear forecast comes out early
    for (let t = 0; t <= 900; t++) {
      samples.push({ t, temp: Math.min(93, 70 + t * 0.2), barDown: 93 - 25 * Math.exp(-t / 250) });
      run = stepHeatRun(run, samples, 93, 1_000_000, { voltage: 240, profile: "LRv2", machineReady: t >= 400 });
    }
    const saved = loadHeatRuns();
    expect(saved).toHaveLength(1);
    expect(saved[0].water.readyAt).toBeGreaterThan(100);
    expect(saved[0].barDown.readyAt).toBeGreaterThan(500);
    expect(saved[0].barDown.guesses.length).toBeGreaterThan(5);
    expect(saved[0]).toMatchObject({ voltage: 240, profile: "LRv2", machineReadyAt: 400, lastT: 900, startGroup: { temp: 70, barDown: 68 } });
    expect(saved[0].curve).toHaveLength(181);
    expect(saved[0].curve![1]).toEqual([5, 71, null, null, null, 68.5, null, null]);
    const rows = heatErrors(saved, "barDown");
    expect(rows[0].avg).toBeLessThan(0); // optimistic far out
  });
  it("tells hot from cold water by the dip, with nothing to tap", () => {
    const run = (pouredAt: number) => {
      let r: HeatRun | null = null;
      const samples: HeatSample[] = [];
      for (let t = 0; t <= 300; t++) {
        const temp = t < 100 ? 60 + t * 0.3 : Math.max(pouredAt, 90 - (t - 100) * 2) + (t - 100) * 0.05;
        samples.push({ t, temp, barDown: 70 + t * 0.02 });
        r = stepHeatRun(r, samples, 93, 2_000_000 + pouredAt, { waitingForWater: t >= 80 && t < 100 });
      }
      return r!;
    };
    const hot = run(85), cold = run(45);
    expect(hot.water).toMatchObject({ addedAt: 100, kind: "hot" });
    expect(cold.water).toMatchObject({ addedAt: 100, kind: "cold" });
    expect(cold.water.tubeMinAfter).toBeLessThan(50);
    expect(cold.water.guesses.every((g) => g.t >= 100)).toBe(true);
    expect(heatErrors(loadHeatRuns(), "water", "hot")).toHaveLength(3);
  });
});
