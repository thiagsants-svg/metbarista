/**
 * Last shot of a given coffee: recipe, time and grind,
 * read from the machine's shot history.
 *
 * Each shot started from the Station carries "Coffee: … · Grind: …" in its
 * profile (display.shortDescription). As a fallback, the Station also keeps a
 * small local log of what was loaded and when, matched to shots by time.
 */

import { barDownOf } from "./bar-down";
import { activeTargets } from "./shot-facts";
import { computeShotStats } from "./machine-api";
import { getShotNote } from "./shot-notes";
import { asciiName, baseName, sameCoffee, parseShotNotes, parseTds, recentBeans, SHOT_NAME_RE, type Recipe } from "./recipe";
import type { Profile, ShotEntry } from "./types";

const LOG_KEY = "metbarista_shot_log";

interface LogEntry {
  at: number; // ms, when the profile was loaded
  coffee: string;
  grind: string;
  /** Grind read from the grinder when the shot started (wins over the one sent with the profile) */
  atBrew?: boolean;
  /** The machine's number for the shot made with this load, once it's known */
  dbKey?: number;
}

/** Remembers what was loaded, in case the machine's history drops the notes. */
export function logShotNotes(coffee: string | undefined, grind: string): void {
  const c = coffee?.trim();
  if (!c) return;
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
    list.unshift({ at: Date.now(), coffee: c, grind });
    localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, 100)));
  } catch { /* storage full or blocked: the machine history still has it */ }
}

/** What the grinder had when the shot started: replaces the grind of the shot being made. */
export function recordBrewGrind(grind: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
    const cur = list[0];
    if (!cur || Date.now() - cur.at > 30 * 60_000) return; // not a shot started from the Station
    list[0] = { ...cur, grind, atBrew: true };
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch { /* storage blocked */ }
}

/**
 * The shot that just ended: the newest one saved after the shot started
 * (a minute of slack for clocks) that wasn't the newest before it.
 */
export function findNewShot(history: ShotEntry[], startedAt: number, keyBefore: number | null): ShotEntry | null {
  return [...history].sort((a, b) => b.time - a.time)
    .find((h) => h.db_key !== keyBefore && h.time * 1000 >= startedAt - 60_000) ?? null;
}

/**
 * Ties the latest load to the machine's number for the shot made with it, so
 * its coffee and grind are found by number instead of by time. Skipped when
 * the shot's own notes name another coffee (e.g. a shot started on the machine).
 */
export function linkShot(shot: ShotEntry): void {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
    const cur = list[0];
    if (!cur || cur.dbKey != null || list.some((e) => e.dbKey === shot.db_key)) return;
    if (shot.time * 1000 < cur.at - 60_000) return; // the shot is older than the load
    const named = parseShotNotes(shot.profile?.display?.shortDescription).coffee;
    if (named && !sameCoffee(named, cur.coffee)) return;
    list[0] = { ...cur, dbKey: shot.db_key };
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch { /* storage blocked */ }
}

function readLog(): LogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[]; } catch { return []; }
}

/**
 * Notes of a shot: from its profile, else from the local log: the load tied to
 * its number, or for older records, a load up to 30 min before it that isn't
 * tied to another shot.
 */
function notesFor(shot: ShotEntry, log: LogEntry[]): { coffee?: string; grind?: string } {
  const fromProfile = parseShotNotes(shot.profile?.display?.shortDescription);
  const t = shot.time * 1000;
  const hit = log.find((e) => e.dbKey === shot.db_key)
    ?? log.find((e) => e.dbKey == null && e.at <= t + 60_000 && t - e.at < 30 * 60_000);
  if (fromProfile.coffee) {
    // The grinder reading at brew time is the true record
    const same = hit?.atBrew && hit.coffee.toLowerCase() === fromProfile.coffee.toLowerCase();
    return same ? { ...fromProfile, grind: hit.grind } : fromProfile;
  }
  if (hit) return { coffee: hit.coffee, grind: hit.grind };
  // Last resort: the name ("… - Etiopia Guji 150um"), plain ASCII
  const m = SHOT_NAME_RE.exec(shot.name ?? "");
  if (m?.[4]) return { coffee: m[4], grind: m[5] ? `${m[5]}µm` : m[6] ? `grind ${m[6]}` : undefined };
  return {};
}

/** Same coffee? Ignores case and accents ("Etiópia" in the list, "Etiopia" in a shot name). */
// sameCoffee: lib/recipe.ts

/** A shot's grind as shown: "140 µm" on the Motto 80, "grind 2.5" on a dial; null when unknown */
export function shotGrindLabel(s: CoffeeLastShot): string | null {
  if (s.patch.grindUm != null) return `${s.patch.grindUm} µm`;
  if (s.patch.grindSetting != null) return `grind ${s.patch.grindSetting}`;
  return null;
}

/**
 * Coffee and grind of a shot, for display. On the device that made the shot,
 * the grind read from the grinder when the shot started wins.
 */
export function shotNotes(shot: ShotEntry): { coffee?: string; grind?: string } {
  return notesFor(shot, readLog());
}

/** "Motto 80 140µm feed 65 1000rpm" → fields */
export function parseGrind(text: string | undefined): Partial<Recipe> {
  if (!text) return {};
  const um = /(\d+)\s*µm/.exec(text)?.[1];
  const setting = /grind ([\d.]+)/.exec(text)?.[1];
  const feed = /feed (\d+)/.exec(text)?.[1];
  const rpm = /(\d+)\s*rpm/.exec(text)?.[1];
  const grinder = text.replace(/\s*(\d+\s*µm|grind [\d.]+|\d+\s*rpm).*$/, "").trim();
  return {
    ...(grinder ? { grinder } : {}),
    // Fields of the other kind of grinder are cleared
    grindUm: um ? Number(um) : undefined,
    grindSetting: setting ? Number(setting) : undefined,
    feed: feed ? Number(feed) : undefined,
    rpm: rpm ? Number(rpm) : undefined,
  };
}

export interface CoffeeLastShot {
  coffee: string;
  when: number; // ms
  profileName: string;
  /** Dose, ratio, temperature, base profile and grind to fill the recipe with */
  patch: Partial<Recipe>;
  weight: number;
  seconds: number;
  /** Your stars from Tasting Notes (saved on this device), if any */
  stars: number | null;
  /** Refractometer reading and extraction yield, from the shot's notes (this device) */
  tds?: number;
  ey?: number;
  /** Bar down (°C) when the shot started (lib/bar-down.ts) */
  barDown?: number | null;
  /** The shot in the machine's history (to read its face) */
  dbKey?: number;
  /** The shot's string id on the machine (its face is read and set with it) */
  shotId?: string;
  /** Face set on the shot: read from the machine after the summary is made */
  face?: "like" | "dislike" | null;
  /** Curve of the shot for the idle list's chart (not kept in the device's record) */
  points?: ShotCurvePoint[];
}

/** Same fields the Station's shot chart plots */
export interface ShotCurvePoint {
  t: number;
  pressure: number | null;
  flow: number | null;
  grav: number | null;
  weight: number | null;
  temp: null;
  stage: string | null;
  /** What the machine was following: the pressure or the flow target (the other one is a limit) */
  pTarget: number | null;
  fTarget: number | null;
}

/** The shot's curve, thinned to about 250 points (the machine keeps ~10 a second) */
export function shotPoints(shot: ShotEntry, max = 250): ShotCurvePoint[] {
  const frames = shot.data ?? [];
  const step = Math.max(1, Math.ceil(frames.length / max));
  return frames.filter((_, i) => i % step === 0 || i === frames.length - 1).map((f) => ({
    t: f.time,
    pressure: f.shot?.pressure ?? null,
    flow: f.shot?.flow ?? null,
    grav: f.shot?.gravimetric_flow ?? null,
    weight: f.shot?.weight ?? null,
    temp: null,
    stage: f.status ?? null,
    ...activeTargets(f.shot?.setpoints),
  }));
}

const CACHE_KEY = "metbarista_coffee_last";

/**
 * Each coffee's last shot, kept on this device: a frozen coffee may wait
 * months, far beyond the shots the history lookup reads.
 */
function readCache(): Record<string, CoffeeLastShot> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, CoffeeLastShot>; } catch { return {}; }
}

function cache(entry: CoffeeLastShot): void {
  const all = readCache();
  const key = asciiName(entry.coffee).toLowerCase();
  if ((all[key]?.when ?? 0) > entry.when) return;
  all[key] = entry;
  // Keep the 100 most recent coffees
  const kept = Object.entries(all).sort((a, b) => b[1].when - a[1].when).slice(0, 100);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage full */ }
}

function summarize(shot: ShotEntry, notes: { coffee?: string; grind?: string }, profiles: Profile[]): CoffeeLastShot {
  const patch: Partial<Recipe> = { coffee: notes.coffee, ...parseGrind(notes.grind) };
  // Name "Base - 20g 1:2.5 94C" (see buildShotProfile)
  const m = SHOT_NAME_RE.exec(shot.name ?? "");
  if (m) Object.assign(patch, { dose: Number(m[1]), ratio: Number(m[2]), temperature: Number(m[3]) });
  else if (shot.profile?.temperature) patch.temperature = shot.profile.temperature;
  const baseId = shot.profile?.id;
  if (baseId && profiles.some((p) => p.id === baseId)) patch.baseProfileId = baseId;

  const stats = computeShotStats(shot.data ?? []);
  return {
    // Shots keep plain ASCII ("Etiopia"): show it as written in the coffee list ("Etiópia")
    coffee: notes.coffee
      ? recentBeans().find((b) => sameCoffee(b, notes.coffee)) ?? notes.coffee
      : "",
    when: shot.time * 1000,
    profileName: baseName(shot.name ?? ""),
    patch,
    weight: stats.finalWeight,
    seconds: stats.durationSec,
    stars: getShotNote(shot.time)?.rating || null,
    ...parseTds(getShotNote(shot.time)?.note),
    dbKey: shot.db_key,
    shotId: shot.id,
    barDown: barDownOf(shot),
  };
}

/** Summary of any shot (coffee and grind from its notes or this device's record) */
export function shotSummary(shot: ShotEntry, profiles: Profile[] = []): CoffeeLastShot {
  return summarize(shot, notesFor(shot, readLog()), profiles);
}

/** Last shot of a coffee: from the recent history if it's there, else from this device's record. */
export function findLastShotForCoffee(coffee: string, history: ShotEntry[], profiles: Profile[]): CoffeeLastShot | null {
  const want = coffee.trim().toLowerCase();
  if (!want) return null;
  const log = readLog();
  const shot = [...history].sort((a, b) => b.time - a.time)
    .find((s) => sameCoffee(notesFor(s, log).coffee, coffee));
  if (shot) {
    // Keep the coffee as written in the list (the name in a shot is plain ASCII)
    const found = summarize(shot, { ...notesFor(shot, log), coffee: coffee.trim() }, profiles);
    cache(found);
    return found;
  }
  const saved = readCache()[asciiName(want).toLowerCase()];
  if (!saved) return null;
  // Stars may have been given after the shot was recorded
  return { ...saved, stars: getShotNote(saved.when / 1000)?.rating || saved.stars };
}

/**
 * The last few shots of a coffee, newest first (for the idle screen). Without
 * a coffee: the machine's latest shots. A coffee whose shots are all beyond the
 * history read falls back to its recorded last shot.
 */
/** The shots recentShotsForCoffee() would show: the only ones whose curves need reading */
export function pickRecentShots(coffee: string | undefined, history: ShotEntry[], count = 4): ShotEntry[] {
  const log = readLog();
  const want = coffee?.trim();
  return [...history].sort((a, b) => b.time - a.time)
    .filter((s) => !want || sameCoffee(notesFor(s, log).coffee, want))
    .slice(0, count);
}

export function recentShotsForCoffee(coffee: string | undefined, history: ShotEntry[], profiles: Profile[], count = 4): CoffeeLastShot[] {
  const log = readLog();
  const want = coffee?.trim();
  const shots = [...history].sort((a, b) => b.time - a.time)
    .filter((s) => !want || sameCoffee(notesFor(s, log).coffee, want))
    .slice(0, count)
    .map((s) => ({ ...summarize(s, want ? { ...notesFor(s, log), coffee: want } : notesFor(s, log), profiles), points: shotPoints(s) }));
  if (shots.length === 0 && want) {
    const saved = findLastShotForCoffee(want, [], profiles);
    return saved ? [saved] : [];
  }
  return shots;
}

/**
 * Records the newest shot under its coffee (called right after a shot ends)
 * and returns its summary (coffee may be empty when none was set).
 */
export function rememberLatestShot(history: ShotEntry[], profiles: Profile[], which?: ShotEntry): CoffeeLastShot | null {
  const shot = which ?? [...history].sort((a, b) => b.time - a.time)[0];
  if (!shot) return null;
  const notes = notesFor(shot, readLog());
  const summary = summarize(shot, notes, profiles);
  if (notes.coffee) cache(summary);
  return summary;
}
