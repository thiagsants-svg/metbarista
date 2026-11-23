/**
 * Last shot of a given coffee: recipe, time, grind and MetBarista's score,
 * read from the machine's shot history.
 *
 * Each shot started from the Station carries "Coffee: … · Grind: …" in its
 * profile (display.shortDescription). As a fallback, the Station also keeps a
 * small local log of what was loaded and when, matched to shots by time.
 */

import { analyzeShot } from "./shot-analysis";
import { computeShotStats } from "./machine-api";
import { getShotNote } from "./shot-notes";
import { parseShotNotes, type Recipe } from "./recipe";
import type { Profile, ShotEntry } from "./types";

const LOG_KEY = "metbarista_shot_log";

interface LogEntry {
  at: number; // ms, when the profile was loaded
  coffee: string;
  grind: string;
  /** Grind read from the grinder when the shot started (wins over the one sent with the profile) */
  atBrew?: boolean;
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

function readLog(): LogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[]; } catch { return []; }
}

/** Notes of a shot: from its profile, else from the local log (loaded up to 30 min before). */
function notesFor(shot: ShotEntry, log: LogEntry[]): { coffee?: string; grind?: string } {
  const fromProfile = parseShotNotes(shot.profile?.display?.shortDescription);
  const t = shot.time * 1000;
  const hit = log.find((e) => e.at <= t + 60_000 && t - e.at < 30 * 60_000);
  if (fromProfile.coffee) {
    // The grinder reading at brew time is the true record
    const same = hit?.atBrew && hit.coffee.toLowerCase() === fromProfile.coffee.toLowerCase();
    return same ? { ...fromProfile, grind: hit.grind } : fromProfile;
  }
  return hit ? { coffee: hit.coffee, grind: hit.grind } : {};
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
  /** MetBarista's shot score (0–100), null for flushes or when it can't score */
  score: number | null;
  /** Your stars from Tasting Notes (saved on this device), if any */
  stars: number | null;
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
  const key = entry.coffee.toLowerCase();
  if ((all[key]?.when ?? 0) > entry.when) return;
  all[key] = entry;
  // Keep the 100 most recent coffees
  const kept = Object.entries(all).sort((a, b) => b[1].when - a[1].when).slice(0, 100);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage full */ }
}

function summarize(shot: ShotEntry, notes: { coffee?: string; grind?: string }, profiles: Profile[]): CoffeeLastShot {
  const patch: Partial<Recipe> = { coffee: notes.coffee, ...parseGrind(notes.grind) };
  // Name "Base - 20g 1:2.5 94C" (see buildShotProfile)
  const m = / - ([\d.]+)g 1:([\d.]+) ([\d.]+)C$/.exec(shot.name ?? "");
  if (m) Object.assign(patch, { dose: Number(m[1]), ratio: Number(m[2]), temperature: Number(m[3]) });
  else if (shot.profile?.temperature) patch.temperature = shot.profile.temperature;
  const baseId = shot.profile?.id;
  if (baseId && profiles.some((p) => p.id === baseId)) patch.baseProfileId = baseId;

  const stats = computeShotStats(shot.data ?? []);
  const analysis = analyzeShot(shot);
  return {
    coffee: notes.coffee ?? "",
    when: shot.time * 1000,
    profileName: (shot.name ?? "").replace(/ - [\d.]+g 1:[\d.]+ [\d.]+C$/, ""),
    patch,
    weight: stats.finalWeight,
    seconds: stats.durationSec,
    stars: getShotNote(shot.time)?.rating || null,
    score: analysis.throwaway || analysis.applicableCount === 0 ? null : analysis.overallScore,
  };
}

/** Last shot of a coffee: from the recent history if it's there, else from this device's record. */
export function findLastShotForCoffee(coffee: string, history: ShotEntry[], profiles: Profile[]): CoffeeLastShot | null {
  const want = coffee.trim().toLowerCase();
  if (!want) return null;
  const log = readLog();
  const shot = [...history].sort((a, b) => b.time - a.time)
    .find((s) => notesFor(s, log).coffee?.toLowerCase() === want);
  if (shot) {
    const found = summarize(shot, notesFor(shot, log), profiles);
    cache(found);
    return found;
  }
  const saved = readCache()[want];
  if (!saved) return null;
  // Stars may have been given after the shot was recorded
  return { ...saved, stars: getShotNote(saved.when / 1000)?.rating || saved.stars };
}

/** Records the newest shot under its coffee (called right after a shot ends). */
export function rememberLatestShot(history: ShotEntry[], profiles: Profile[]): void {
  const shot = [...history].sort((a, b) => b.time - a.time)[0];
  if (!shot) return;
  const notes = notesFor(shot, readLog());
  if (notes.coffee) cache(summarize(shot, notes, profiles));
}
