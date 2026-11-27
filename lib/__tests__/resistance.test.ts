import { describe, expect, it } from "vitest";
import { resistanceOf } from "../resistance";
import { estimateTds } from "../tds-estimate";

describe("puck resistance", () => {
  it("is pressure over cup flow squared, only after the first drops", () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ t: i * 200, pressure: 9, grav: i < 10 ? 0 : 1.5, weight: i < 12 ? 1 : 2 + i * 0.3 }));
    const r = resistanceOf(pts);
    expect(r.slice(0, 12).every((x) => x == null)).toBe(true);
    expect(r[39]).toBeCloseTo(9 / 2.25, 1);
  });
});

describe("estimated TDS only from the same profile and temperature", () => {
  const ref = (profile: string, temperature: number) => ({ coffee: "Kenya", dose: 20, ratio: 2, ey: 21, profile, temperature });
  it("skips shots pulled with another profile or 2 °C apart", () => {
    const shot = { coffee: "Kenya", dose: 20, ratio: 2, cupWeight: 40, profile: "LRv2", temperature: 94 };
    expect(estimateTds(shot, [ref("Lever 40g 94", 94), ref("Lever 40g 94", 94), ref("Lever 40g 94", 94)])).toBeNull();
    expect(estimateTds(shot, [ref("LRv2", 96), ref("LRv2", 96), ref("LRv2", 96)])).toBeNull();
    expect(estimateTds(shot, [ref("lrv2", 94), ref("LRv2", 95), ref("LRv2", 94)])?.tds).toBeCloseTo(10.5, 1);
  });
});
