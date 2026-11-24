/**
 * Stats about the coffee, not about you: how many shots, how much coffee went
 * through, what you liked, where extraction landed, and each coffee's story
 * (with the recipe of its last liked shot). Pure functions over a light list
 * of shots (no curves), so months of history stay quick.
 */

import type { Taste } from "./next-plan";

export interface ShotLite {
  id: string;
  /** ms */
  at: number;
  coffee: string;
  dose?: number;
  ratio?: number;
  temperature?: number;
  /** "140 µm", "grind 2.5" */
  grind?: string;
  profile: string;
  taste?: Taste;
  tds?: number;
  ey?: number;
  face?: "like" | "dislike" | null;
}

export interface CoffeeStats {
  name: string;
  shots: number;
  grams: number;
  liked: number;
  disliked: number;
  ey: { min: number; max: number; avg: number; n: number } | null;
  lastGrind?: string;
  lastAt: number;
  /** The last liked shot's recipe */
  best?: Pick<ShotLite, "dose" | "ratio" | "temperature" | "grind" | "at">;
}

export interface Bucket { start: number; shots: number; grams: number }

export interface Stats {
  shots: number;
  grams: number;
  /** Shots that know their dose (the ones made from the Station) */
  dosed: number;
  rated: number;
  liked: number;
  disliked: number;
  ey: { avg: number; n: number } | null;
  taste: Record<Taste, number>;
  buckets: Bucket[];
  coffees: CoffeeStats[];
  profiles: { name: string; count: number }[];
}

const DAY = 86_400_000;

/** Start of the local day / Monday of the local week */
export function bucketStart(ms: number, by: "day" | "week"): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  if (by === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function computeStats(all: ShotLite[], from: number, now: number, by: "day" | "week"): Stats {
  const shots = all.filter((s) => s.at >= from && s.at <= now).sort((a, b) => b.at - a.at);
  const grams = shots.reduce((g, s) => g + (s.dose ?? 0), 0);
  const eys = shots.flatMap((s) => (s.ey != null ? [s.ey] : []));
  const taste: Record<Taste, number> = { sour: 0, balanced: 0, bitter: 0 };
  for (const s of shots) if (s.taste) taste[s.taste]++;

  // Every day / week of the period, empty ones too
  const buckets: Bucket[] = [];
  for (let t = bucketStart(from, by); t <= now; t = bucketStart(t + (by === "day" ? DAY : 7 * DAY) + DAY / 2, by)) {
    buckets.push({ start: t, shots: 0, grams: 0 });
  }
  for (const s of shots) {
    const b = buckets.find((x) => x.start === bucketStart(s.at, by));
    if (b) { b.shots++; b.grams += s.dose ?? 0; }
  }

  const byCoffee = new Map<string, ShotLite[]>();
  for (const s of shots) {
    if (!s.coffee) continue;
    const k = s.coffee.toLowerCase();
    byCoffee.set(k, [...(byCoffee.get(k) ?? []), s]);
  }
  const coffees: CoffeeStats[] = [...byCoffee.values()].map((list) => {
    const e = list.flatMap((s) => (s.ey != null ? [s.ey] : []));
    const best = list.find((s) => s.face === "like");
    return {
      name: list[0].coffee,
      shots: list.length,
      grams: list.reduce((g, s) => g + (s.dose ?? 0), 0),
      liked: list.filter((s) => s.face === "like").length,
      disliked: list.filter((s) => s.face === "dislike").length,
      ey: e.length ? { min: Math.min(...e), max: Math.max(...e), avg: r1(avg(e)), n: e.length } : null,
      lastGrind: list.find((s) => s.grind)?.grind,
      lastAt: list[0].at,
      ...(best ? { best: { dose: best.dose, ratio: best.ratio, temperature: best.temperature, grind: best.grind, at: best.at } } : {}),
    };
  }).sort((a, b) => b.shots - a.shots || b.lastAt - a.lastAt);

  const profiles = new Map<string, number>();
  for (const s of shots) profiles.set(s.profile, (profiles.get(s.profile) ?? 0) + 1);

  return {
    shots: shots.length,
    grams: r1(grams),
    dosed: shots.filter((s) => s.dose != null).length,
    rated: shots.filter((s) => s.face).length,
    liked: shots.filter((s) => s.face === "like").length,
    disliked: shots.filter((s) => s.face === "dislike").length,
    ey: eys.length ? { avg: r1(avg(eys)), n: eys.length } : null,
    taste,
    buckets,
    coffees,
    profiles: [...profiles.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}
