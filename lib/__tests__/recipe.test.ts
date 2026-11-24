import { describe, expect, it } from "vitest";
import {
  asciiName, baseName, buildShotProfile, grindText, maxYieldFor, MAX_FINAL_WEIGHT, overCapacity, parseShotNotes,
  retractionFor, retractionMlToMm, retractionMmToMl, RETRACTION_MAX_ML, RETRACTION_MIN_ML, SHOT_NAME_RE, shotNotesText,
} from "../recipe";
import type { Profile } from "../types";

const base = { id: "base-1", name: "Damian's LRv2", temperature: 92, final_weight: 36, display: {} } as unknown as Profile;

describe("retraction (written to the machine)", () => {
  it("converts ml and mm like Meticulous's web UI and Dial", () => {
    // Values from the machine and the official UI
    expect(retractionMlToMm(150)).toBe(67.99);
    expect(retractionMlToMm(100)).toBe(45.33);
    expect(retractionMlToMm(80)).toBe(36.26);
    expect(retractionMmToMl(67.99)).toBe(150);
    expect(retractionMmToMl(45.33)).toBe(100);
  });

  it("stays inside the machine's 80-150 ml (36.26-67.99 mm) for every recipe", () => {
    for (let dose = 5; dose <= 30; dose += 0.5) {
      for (const ratio of [1, 1.5, 1.8, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const ml = retractionFor({ dose, ratio });
        expect(ml).toBeGreaterThanOrEqual(RETRACTION_MIN_ML);
        expect(ml).toBeLessThanOrEqual(RETRACTION_MAX_ML);
        const mm = retractionMlToMm(ml);
        expect(mm).toBeGreaterThanOrEqual(36.26);
        expect(mm).toBeLessThanOrEqual(67.99);
      }
    }
  });

  it("is yield + 1.25 x dose + 10 ml, rounded up", () => {
    expect(retractionFor({ dose: 20, ratio: 2.5 })).toBe(85);
    expect(retractionFor({ dose: 20, ratio: 4 })).toBe(115);
    expect(retractionFor({ dose: 15, ratio: 5 })).toBe(104);
    expect(retractionFor({ dose: 20, ratio: 2 })).toBe(80); // minimum
  });

  it("never counts more than 100 g of yield", () => {
    expect(retractionFor({ dose: 20, ratio: 6 })).toBe(retractionFor({ dose: 20, ratio: 5 }));
    expect(retractionFor({ dose: 20, ratio: 10 })).toBe(135);
  });
});

describe("100 g cap and capacity warning", () => {
  it("caps the final weight sent to the machine at 100 g", () => {
    expect(MAX_FINAL_WEIGHT).toBe(100);
    expect(buildShotProfile(base, { baseProfileId: null, dose: 20, ratio: 7, temperature: 94 }).final_weight).toBe(100);
    expect(buildShotProfile(base, { baseProfileId: null, dose: 15, ratio: 5, temperature: 94 }).final_weight).toBe(75);
  });

  it("max yield is the smaller of 100 g and one piston of water", () => {
    expect(maxYieldFor(20)).toBe(100);
    expect(maxYieldFor(30)).toBe(100); // one piston would give ~102 g
    expect(maxYieldFor(10)).toBe(100);
  });

  it("warns only above the max", () => {
    expect(overCapacity({ dose: 20, ratio: 5 })).toBe(false);
    expect(overCapacity({ dose: 20, ratio: 6 })).toBe(true);
    expect(overCapacity({ dose: 10, ratio: 10 })).toBe(false);
  });
});

describe("shot name and notes (kept in the machine's history)", () => {
  it("puts recipe, coffee and grind in the name, plain ASCII, and reads them back", () => {
    const p = buildShotProfile(base, {
      baseProfileId: null, dose: 20, ratio: 2.5, temperature: 94,
      coffee: "Etiópia Guji", grinder: "Motto 80", grindUm: 150, feed: 65, rpm: 1000,
    });
    expect(p.name).toBe("Damian's LRv2 - 20g 1:2.5 94C - Etiopia Guji 150um");
    expect(p.temperature).toBe(94);
    expect(p.final_weight).toBe(50);
    const m = SHOT_NAME_RE.exec(p.name)!;
    expect(m.slice(1, 6)).toEqual(["20", "2.5", "94", "Etiopia Guji", "150"]);
    expect(baseName(p.name)).toBe("Damian's LRv2");
    // Only plain ASCII goes to the machine (it garbles accents and symbols)
    expect(/^[\x20-\x7e]*$/.test(p.name)).toBe(true);
    expect(/^[\x20-\x7e]*$/.test(p.display?.shortDescription ?? "")).toBe(true);
    expect(parseShotNotes(p.display?.shortDescription)).toEqual({
      coffee: "Etiopia Guji", grind: "Motto 80 150µm feed 65 1000rpm",
    });
  });

  it("uses a dial setting for other grinders", () => {
    const p = buildShotProfile(base, {
      baseProfileId: null, dose: 18, ratio: 2, temperature: 93, coffee: "Café do Sítio", grinder: "Niche Zero", grindSetting: 2.5,
    });
    expect(p.name).toBe("Damian's LRv2 - 18g 1:2 93C - Cafe do Sitio grind 2.5");
    expect(SHOT_NAME_RE.exec(p.name)?.[6]).toBe("2.5");
  });

  it("leaves the name as before without a coffee", () => {
    const p = buildShotProfile(base, { baseProfileId: null, dose: 20, ratio: 2, temperature: 94 });
    expect(p.name).toBe("Damian's LRv2 - 20g 1:2 94C");
    expect(baseName(p.name)).toBe("Damian's LRv2");
  });

  it("reads notes written by older versions (· separator, µm)", () => {
    expect(parseShotNotes("Coffee: Kenya · Grind: Motto 80 140µm feed 65 1000rpm")).toEqual({
      coffee: "Kenya", grind: "Motto 80 140µm feed 65 1000rpm",
    });
  });

  it("builds notes and grind text", () => {
    expect(grindText({ grinder: "Motto 80" })).toBe("Motto 80 150µm feed 65 1000rpm");
    expect(shotNotesText({ coffee: "Açaí", grinder: "Motto 80", grindUm: 140 })).toBe(
      "Coffee: Acai | Grind: Motto 80 140um feed 65 1000rpm",
    );
    expect(asciiName("Etiópia · Guji °")).toBe("Etiopia Guji");
  });
});
