import { describe, expect, it } from "vitest";
import { likedBand, targetFor, TARGETS } from "../brew-control";

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
    expect(targetFor(2)).toMatchObject({ ey: [18, 24], tds: [9, 12] });
    expect(targetFor(2.5).tds).toEqual([7.2, 9.6]);
  });

  it("matches DiFluid's espresso standards without a ratio", () => {
    expect(TARGETS.normale).toMatchObject({ ey: [18, 22], tds: [8, 12] });
    expect(TARGETS.lungo.tds).toEqual([5, 8]);
    expect(TARGETS.ristretto.tds).toEqual([12, 18]);
  });
});

describe("the coffee's own target", () => {
  it("learns the box from 3 or more liked shots, at least 2 % wide", () => {
    expect(likedBand([22, 23.5])).toBeNull();
    expect(likedBand([22, 23.5, 24.1])).toEqual([21.5, 24.6]);
    expect(likedBand([22, 22.2, 22.4])).toEqual([21.2, 23.2]);
    expect(targetFor(2, [21.5, 24.6])).toMatchObject({ name: "Your liked shots", ey: [21.5, 24.6], tds: [10.75, 12.3] });
  });
});
