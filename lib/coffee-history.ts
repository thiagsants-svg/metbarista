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

function readLog(): LogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[]; } catch { return []; }
}

/** Notes of a shot: from its profile, else from the local log (loaded up to 30 min before). */
function notesFor(shot: ShotEntry, log: LogEntry[]): { coffee?: string; grind?: string } {
  const fromProfile = parseShotNotes(shot.profile?.display?.shortDescription);
  if (fromProfile.coffee) return fromProfile;
  const t = shot.time * 1000;
  const hit = log.find((e) => e.at <= t + 60_000 && t - e.at < 30 * 60_000);
  return hit ? { coffee: hit.coffee, grind: hit.grind } : {};
}

/** "Motto 80 140µm feed 65 1000rpm" → fields */
export function parseGrind(text: string | undefined): Partial<Recipe> {
  if (!text) return {};
  const um = /(\d+)\s*µm/.exec(text)?.[1];
  const feed = /feed (\d+)/.exec(text)?.[1];
  const rpm = /(\d+)\s*rpm/.exec(text)?.[1];
  const grinder = text.replace(/\s*\d+\s*µm.*$/, "").trim();
  return {
    ...(grinder ? { grinder } : {}),
    ...(um ? { grindUm: Number(um) } : {}),
    ...(feed ? { feed: Number(feed) } : {}),
    ...(rpm ? { rpm: Number(rpm) } : {}),
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

export function findLastShotForCoffee(coffee: string, history: ShotEntry[], profiles: Profile[]): CoffeeLastShot | null {
  const want = coffee.trim().toLowerCase();
  if (!want) return null;
  const log = readLog();
  const shot = [...history].sort((a, b) => b.time - a.time)
    .find((s) => notesFor(s, log).coffee?.toLowerCase() === want);
  if (!shot) return null;

  const notes = notesFor(shot, log);
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
    coffee: notes.coffee ?? coffee,
    when: shot.time * 1000,
    profileName: (shot.name ?? "").replace(/ - [\d.]+g 1:[\d.]+ [\d.]+C$/, ""),
    patch,
    weight: stats.finalWeight,
    seconds: stats.durationSec,
    stars: getShotNote(shot.time)?.rating || null,
    score: analysis.throwaway || analysis.applicableCount === 0 ? null : analysis.overallScore,
  };
}
