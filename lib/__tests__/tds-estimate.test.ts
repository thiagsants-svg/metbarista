import { describe, expect, it } from "vitest";
import { estimateTds, type EyReference } from "../tds-estimate";

const ref = (ey: number, dose = 18, ratio = 2.2, coffee = "Etiópia"): EyReference => ({ coffee, dose, ratio, ey });

describe("TDS estimate from measured shots", () => {
  it("uses the typical EY of similar shots of the same coffee", () => {
    const e = estimateTds({ coffee: "etiopia", dose: 18, ratio: 2.2, cupWeight: 40 }, [ref(19), ref(20), ref(21), ref(30, 20, 3)]);
    expect(e).toMatchObject({ ey: 20, n: 3, basis: "similar" });
    expect(e!.tds).toBeCloseTo(9, 2);
  });
  it("gives none when no shots were made alike (other doses or ratios mix extractions)", () => {
    expect(estimateTds({ coffee: "Etiópia", dose: 15, ratio: 2, cupWeight: 30 }, [ref(19), ref(20), ref(21)])).toBeNull();
  });
  it("gives none with too few readings, another coffee, or no cup weight", () => {
    expect(estimateTds({ coffee: "Etiópia", dose: 18, cupWeight: 40 }, [ref(19), ref(20)])).toBeNull();
    expect(estimateTds({ coffee: "Kenya", dose: 18, cupWeight: 40 }, [ref(19), ref(20), ref(21)])).toBeNull();
    expect(estimateTds({ coffee: "Etiópia", dose: 18, cupWeight: 0 }, [ref(19), ref(20), ref(21)])).toBeNull();
  });
});

describe("TDS estimate: grind, time and margin", () => {
  const r = (ey: number, grind: number, seconds: number): EyReference => ({ coffee: "Kenya", dose: 18, ratio: 2, ey, grind, seconds });
  it("prefers shots ground and timed alike, with a margin from their spread", () => {
    const refs = [r(19, 140, 30), r(20, 140, 31), r(21, 142, 29), r(25, 110, 45)];
    const e = estimateTds({ coffee: "Kenya", dose: 18, ratio: 2, cupWeight: 36, grind: 140, seconds: 30 }, refs);
    expect(e).toMatchObject({ basis: "similar", n: 3, ey: 20, differs: [] });
    expect(e!.margin).toBeCloseTo(0.5, 2);
  });
  it("gives none when this shot's grind or time is outside the measured ones", () => {
    const refs = [r(19, 140, 30), r(20, 141, 31), r(21, 142, 29)];
    expect(estimateTds({ coffee: "Kenya", dose: 18, ratio: 2, cupWeight: 36, grind: 120, seconds: 45 }, refs)).toBeNull();
  });
});
