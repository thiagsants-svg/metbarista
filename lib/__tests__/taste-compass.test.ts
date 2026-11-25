import { describe, expect, it } from "vitest";
import { compassBody, compassHint, compassPoint, compassTaste, compassText } from "../taste-compass";

describe("taste compass", () => {
  it("reads both axes, with a fine zone in the middle", () => {
    expect(compassTaste({ x: -0.7, y: 0 })).toBe("sour");
    expect(compassTaste({ x: 0.1, y: 0 })).toBe("balanced");
    expect(compassTaste({ x: 0.5, y: 0 })).toBe("bitter");
    expect(compassBody({ x: 0, y: -0.4 })).toBe("weak");
    expect(compassBody({ x: 0, y: 0.2 })).toBeUndefined();
    expect(compassBody({ x: 0, y: 0.9 })).toBe("strong");
  });

  it("puts a saved answer back where it reads the same", () => {
    const p = compassPoint("sour", "strong")!;
    expect([compassTaste(p), compassBody(p)]).toEqual(["sour", "strong"]);
    expect(compassPoint(undefined, undefined)).toBeNull();
    expect(compassText("balanced", undefined)).toBe("Balanced");
    expect(compassText("bitter", "weak")).toBe("Bitter · Weak");
  });

  it("points the way the compass's arrows do", () => {
    expect(compassHint("sour", "strong")).toMatch(/more yield/);
    expect(compassHint("sour", "weak")).toMatch(/extract more/);
    expect(compassHint("bitter", "weak")).toMatch(/less yield/);
    expect(compassHint("bitter", undefined)).toMatch(/extract less/);
    expect(compassHint("balanced", undefined)).toBeNull();
  });
});
