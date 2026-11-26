import { describe, expect, it } from "vitest";
import { brewVerdict, targetFor, TARGETS } from "../brew-control";

describe("target box from the ratio", () => {
  it("ristretto up to 1:1.5, lungo from 1:3, normale between", () => {
    expect(targetFor(1).name).toBe("Ristretto");
    expect(targetFor(1.5).name).toBe("Ristretto");
    expect(targetFor(2).name).toBe("Normale");
    expect(targetFor(2.5).name).toBe("Normale");
    expect(targetFor(3).name).toBe("Lungo");
    expect(targetFor(undefined).name).toBe("Normale");
  });

  it("puts the box on the shot's own ratio line", () => {
    expect(targetFor(2)).toMatchObject({ ey: [18, 23], tds: [9, 11.5] });
    expect(targetFor(2.5).tds).toEqual([7.2, 9.2]);
  });

  it("matches DiFluid's espresso standards without a ratio", () => {
    expect(TARGETS.normale).toMatchObject({ ey: [18, 22], tds: [8, 12] });
    expect(TARGETS.lungo.tds).toEqual([5, 8]);
    expect(TARGETS.ristretto.tds).toEqual([12, 18]);
  });
});

describe("brewVerdict", () => {
  const box = TARGETS.normale;

  it("inside the box", () => {
    expect(brewVerdict(10, 20, box)).toMatchObject({ extraction: "ideal", strength: "ideal", hint: null });
  });

  it("under-extracted points to more extraction", () => {
    const v = brewVerdict(9, 17, box);
    expect(v.text).toBe("Under-extracted · strength OK");
    expect(v.hint).toMatch(/finer/);
  });

  it("over-extracted and strong", () => {
    expect(brewVerdict(13, 23, box)).toMatchObject({ extraction: "over", strength: "strong" });
  });

  it("weak but well extracted suggests a shorter ratio", () => {
    expect(brewVerdict(7, 20, box).hint).toMatch(/shorter ratio/);
  });
});
