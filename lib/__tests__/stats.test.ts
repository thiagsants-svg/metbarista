import { describe, expect, it } from "vitest";
import { bucketStart, computeStats, type ShotLite } from "../stats";

const day = (d: number, h = 9) => new Date(2026, 10, d, h).getTime(); // Nov d, 2026

const shot = (p: Partial<ShotLite> & { at: number }): ShotLite =>
  ({ id: String(p.at), coffee: "", profile: "Damian's LRv2", ...p });

describe("stats", () => {
  const shots: ShotLite[] = [
    shot({ at: day(24, 8), coffee: "Moka", dose: 20, ratio: 2, temperature: 95, grind: "140 µm", face: "like", taste: "sour", tds: 10.83, ey: 19.9 }),
    shot({ at: day(24, 7), coffee: "Moka", dose: 20, ratio: 2.5, temperature: 94, grind: "140 µm", face: "like", ey: 23.2 }),
    shot({ at: day(23, 15), coffee: "Melaço", dose: 20, grind: "135 µm", face: "dislike", taste: "bitter" }),
    shot({ at: day(23, 7), coffee: "Moka", dose: 20, grind: "150 µm" }),
    shot({ at: day(20, 18), profile: "Lever 40g 94" }),
    shot({ at: day(1, 9), coffee: "Old", dose: 18 }), // outside the week
  ];
  const s = computeStats(shots, day(18, 0), day(24, 23), "day");

  it("totals for the period", () => {
    expect(s.shots).toBe(5);
    expect(s.grams).toBe(80);
    expect(s.dosed).toBe(4);
    expect(s).toMatchObject({ rated: 3, liked: 2, disliked: 1 });
    expect(s.ey).toEqual({ avg: 21.5, n: 2 });
    expect(s.taste).toEqual({ sour: 1, balanced: 0, bitter: 1 });
  });

  it("one bar per day, empty days included", () => {
    expect(s.buckets).toHaveLength(7);
    expect(s.buckets.map((b) => b.shots)).toEqual([0, 0, 1, 0, 0, 2, 2]);
    expect(s.buckets[6].grams).toBe(40);
  });

  it("each coffee: shots, grams, likes, EY, grind now and the last liked recipe", () => {
    expect(s.coffees[0]).toMatchObject({
      name: "Moka", shots: 3, grams: 60, liked: 2, disliked: 0, lastGrind: "140 µm",
      ey: { min: 19.9, max: 23.2, avg: 21.5, n: 2 },
      best: { dose: 20, ratio: 2, temperature: 95, grind: "140 µm" },
    });
    expect(s.coffees[1]).toMatchObject({ name: "Melaço", shots: 1, disliked: 1 });
    expect(s.coffees[1].best).toBeUndefined();
  });

  it("profiles by use", () => {
    expect(s.profiles[0]).toEqual({ name: "Damian's LRv2", count: 4 });
  });

  it("weeks start on Monday", () => {
    expect(new Date(bucketStart(day(26), "week")).getDay()).toBe(1);
    expect(computeStats(shots, day(1), day(24, 23), "week").buckets.reduce((n, b) => n + b.shots, 0)).toBe(6);
  });
});
