/**
 * Water recipes: what's in the water moves extraction as much as a grind step.
 * GH (general hardness: calcium and magnesium) helps pull flavour out; KH
 * (alkalinity, carbonates) buffers acidity, so high KH tastes flat and chalky,
 * low KH sharp. Both as ppm of CaCO3, as test kits and water recipes give them.
 *
 * Kept in this browser (and in the backup). Which water was in use is kept as
 * a timeline of changes, so every shot, old or new, knows its water without
 * anything being written to the machine; a shot can also be set by hand.
 */

export interface WaterRecipe {
  id: string;
  name: string;
  /** General hardness, ppm as CaCO3 */
  gh?: number;
  /** Carbonate hardness (alkalinity), ppm as CaCO3 */
  kh?: number;
  /** Total dissolved solids, ppm (a TDS pen) */
  tds?: number;
  /** Calcium and magnesium, mg/L, when the label or recipe gives them */
  ca?: number;
  mg?: number;
  ph?: number;
  /** Where it comes from: "filtered tap", "RO + minerals", a bottled brand… */
  source?: string;
  notes?: string;
}

const WATERS_KEY = "metbarista_waters";
const TIMELINE_KEY = "metbarista_water_timeline";
const SHOT_KEY = "metbarista_shot_water";

/** SCA water quality standard for brewing (targets and acceptable ranges) */
export const SCA_WATER = {
  hardness: { target: 68, range: [17, 85] as [number, number] },
  alkalinity: { target: 40, range: [40, 75] as [number, number] },
  tds: { target: 150, range: [75, 250] as [number, number] },
  ph: { target: 7, range: [6.5, 7.5] as [number, number] },
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}
function writeJson(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full */ }
}

export const loadWaters = (): WaterRecipe[] => readJson<WaterRecipe[]>(WATERS_KEY, []);
export const saveWaters = (list: WaterRecipe[]) => writeJson(WATERS_KEY, list);

type Change = { at: number; id: string | null };

/** The water in use from now on (null: not set) */
export function setCurrentWater(id: string | null): void {
  const t = readJson<Change[]>(TIMELINE_KEY, []);
  if (t[t.length - 1]?.id === id) return;
  writeJson(TIMELINE_KEY, [...t, { at: Date.now(), id }]);
}

/** The water in use at a moment (ms), from the timeline */
export function waterIdAt(ms: number): string | null {
  const t = readJson<Change[]>(TIMELINE_KEY, []);
  let id: string | null = null;
  for (const c of t) { if (c.at <= ms) id = c.id; else break; }
  return id;
}

export const currentWaterId = () => waterIdAt(Date.now());

/** A shot's water: set by hand for that shot, else the one in use when it was pulled (shot time in s) */
export function waterIdForShot(shotTimeSec: number): string | null {
  const own = readJson<Record<string, string | null>>(SHOT_KEY, {})[String(Math.round(shotTimeSec))];
  return own !== undefined ? own : waterIdAt(shotTimeSec * 1000);
}
export function setShotWater(shotTimeSec: number, id: string | null): void {
  writeJson(SHOT_KEY, { ...readJson<Record<string, string | null>>(SHOT_KEY, {}), [String(Math.round(shotTimeSec))]: id });
}

export const waterById = (id: string | null | undefined, list = loadWaters()) => (id ? list.find((w) => w.id === id) ?? null : null);

/** "Third Wave (GH 60 · KH 40 ppm)" */
export function waterText(w: WaterRecipe | null): string {
  if (!w) return "";
  const parts = [w.gh != null ? `GH ${w.gh}` : null, w.kh != null ? `KH ${w.kh}` : null, w.tds != null ? `TDS ${w.tds}` : null].filter(Boolean);
  return parts.length ? `${w.name} (${parts.join(" · ")} ppm)` : w.name;
}

/** Notes on a recipe against the SCA standard, in plain words */
export function waterAdvice(w: WaterRecipe): string[] {
  const out: string[] = [];
  if (w.kh != null && w.kh > 75) out.push("High alkalinity (KH): buffers the acidity, can taste flat or chalky.");
  if (w.kh != null && w.kh < 20) out.push("Very low alkalinity (KH): acidity can turn sharp or sour.");
  if (w.gh != null && w.gh > 150) out.push("Very hard (GH): the body can turn heavy and the acidity muted.");
  if (w.gh != null && w.gh < 17) out.push("Very soft (GH): extraction may feel thin.");
  if (w.tds != null && (w.tds < SCA_WATER.tds.range[0] || w.tds > SCA_WATER.tds.range[1])) out.push(`TDS outside the SCA range (${SCA_WATER.tds.range[0]}–${SCA_WATER.tds.range[1]} ppm).`);
  if (w.ph != null && (w.ph < SCA_WATER.ph.range[0] || w.ph > SCA_WATER.ph.range[1])) out.push("pH outside 6.5–7.5.");
  return out;
}
