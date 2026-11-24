import { describe, expect, it } from "vitest";
import { findLastShotForCoffee, parseGrind } from "../coffee-history";
import type { Profile, ShotEntry } from "../types";

const profiles = [{ id: "base-1", name: "Damian's LRv2" }] as unknown as Profile[];

function shot(dbKey: number, time: number, name: string, shortDescription?: string): ShotEntry {
  return {
    id: `s${dbKey}`, db_key: dbKey, time, file: "", name, data: [],
    profile: { id: "base-1", name, temperature: 94, final_weight: 50, display: shortDescription ? { shortDescription } : {} },
  } as unknown as ShotEntry;
}

describe("parseGrind", () => {
  it("reads Motto 80 settings", () => {
    expect(parseGrind("Motto 80 150µm feed 65 1000rpm")).toEqual({
      grinder: "Motto 80", grindUm: 150, grindSetting: undefined, feed: 65, rpm: 1000,
    });
  });

  it("reads a dial setting and clears the Motto fields", () => {
    expect(parseGrind("Niche Zero grind 2.5")).toEqual({
      grinder: "Niche Zero", grindUm: undefined, grindSetting: 2.5, feed: undefined, rpm: undefined,
    });
  });
});

describe("findLastShotForCoffee", () => {
  const history = [
    shot(1, 1_000, "Damian's LRv2 - 20g 1:2 94C - Kenya AA 140um", "Coffee: Kenya AA | Grind: Motto 80 140um feed 65 1000rpm"),
    shot(2, 2_000, "Damian's LRv2 - 18g 1:2.5 93C - Etiopia Guji 145um", "Coffee: Etiopia Guji | Grind: Motto 80 145um feed 60 900rpm"),
    shot(3, 3_000, "Damian's LRv2 - 20g 1:3 94C - Kenya AA 135um", "Coffee: Kenya AA | Grind: Motto 80 135um feed 65 1000rpm"),
  ];

  it("finds the newest shot of that coffee and brings back recipe and grind", () => {
    const last = findLastShotForCoffee("Kenya AA", history, profiles)!;
    expect(last.dbKey).toBe(3);
    expect(last.patch).toMatchObject({ dose: 20, ratio: 3, temperature: 94, grindUm: 135, feed: 65, rpm: 1000, baseProfileId: "base-1" });
    expect(last.profileName).toBe("Damian's LRv2");
  });

  it("matches accents and case (list 'Etiópia', shot 'Etiopia')", () => {
    const last = findLastShotForCoffee("etiópia guji", history, profiles)!;
    expect(last.dbKey).toBe(2);
    expect(last.coffee).toBe("etiópia guji"); // shown as the user wrote it
    expect(last.patch).toMatchObject({ dose: 18, ratio: 2.5, grindUm: 145, feed: 60, rpm: 900 });
  });

  it("falls back to the name when the notes are missing", () => {
    const last = findLastShotForCoffee("Brazil", [shot(9, 9_000, "Damian's LRv2 - 20g 1:2 94C - Brazil 150um")], profiles)!;
    expect(last.patch).toMatchObject({ dose: 20, ratio: 2, grindUm: 150 });
  });

  it("returns null for a coffee with no shots", () => {
    expect(findLastShotForCoffee("Colombia", history, profiles)).toBeNull();
  });
});
