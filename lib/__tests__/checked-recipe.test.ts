import { describe, expect, it } from "vitest";
import { checkedRecipe, retractionFor } from "../recipe";

describe("checkedRecipe", () => {
  it("keeps sane values and clamps the rest to the machine-safe limits", () => {
    expect(checkedRecipe({ dose: 18, ratio: 2, temperature: 93 })).toEqual({ dose: 18, ratio: 2, temperature: 93 });
    expect(checkedRecipe({ dose: 80, ratio: 0.2, temperature: 140 })).toEqual({ dose: 30, ratio: 1, temperature: 100 });
  });

  it("refuses a recipe with a missing number, so nothing empty reaches the machine", () => {
    expect(() => checkedRecipe({ dose: Number.NaN, ratio: 2, temperature: 93 })).toThrow();
    expect(() => retractionFor({ dose: 18, ratio: undefined as unknown as number })).toThrow();
  });
});
