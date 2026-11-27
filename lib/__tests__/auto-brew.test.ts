import { describe, expect, it } from "vitest";
import { barDownGo } from "../station/auto-brew";

const curve = (bd: (t: number) => number, secs = 200) =>
  Array.from({ length: secs }, (_, t) => ({ t, temp: 94, barDown: bd(t) }));

describe("barDownGo", () => {
  it("waits while the Bar down is still climbing far from the target", () => {
    expect(barDownGo(curve((t) => 70 + t * 0.05), 94)).toBe(false);
  });
  it("goes once it is within the margin", () => {
    expect(barDownGo(curve(() => 92.5), 94)).toBe(true);
  });
  it("goes once it has settled below the margin", () => {
    expect(barDownGo(curve(() => 90.4), 94)).toBe(true);
  });
  it("goes when the machine reports no Bar down", () => {
    expect(barDownGo([{ t: 0, temp: 94 }], 94)).toBe(true);
  });
});

describe("Bar down that stops climbing", () => {
  it("is not 'flat' forever: after two minutes a stop counts as settled", async () => {
    const { barDownState } = await import("../heat-log");
    const pts = Array.from({ length: 300 }, (_, t) => ({ t, temp: 94, barDown: t < 120 ? 80 + t * 0.08 : 89.6 }));
    expect(barDownState(pts, 94)?.kind).toBe("settled");
    expect(barDownState(pts.slice(0, 60).map((p) => ({ ...p, barDown: 40 })), 94)?.kind).toBe("flat");
  });
});
