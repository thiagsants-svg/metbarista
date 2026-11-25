/**
 * Meticulous Machine REST API client
 * Talks directly to the machine on your local network.
 * CORS is fully open (Access-Control-Allow-Origin: *) so this works from any origin.
 */

import { machineBase, saveHostname } from "./machine-ip";
import { machineImageUrl } from "./safe-url";
import type {
  MachineInfo,
  MachineSettings,
  Profile,
  HistoryResponse,
  ActionType,
  ShotEntry,
  ShotStats,
  ShotFrame,
} from "./types";
import {
  LOCAL_NETWORK_PERMISSION_TIMEOUT_MS,
  localNetworkRequestInit,
} from "./local-network";
import { cupWeight } from "./cup-weight";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_HISTORY_RESULT_LIMIT = 20;

// ── Helpers ──────────────────────────────────────────────────

function getBaseUrl(): string {
  return machineBase();
}

async function apiFetch<T>(path: string, options?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const base = getBaseUrl();
  if (!base) throw new Error("Machine IP not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/v1${path}`, localNetworkRequestInit({
      ...options,
      signal: controller.signal,
    }));
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error("Machine is busy. Stop the current operation and try again.");
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    // Awaited here, so the timeout also covers the body (a stalled download is aborted)
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Machine info ─────────────────────────────────────────────

export async function getMachineInfo(): Promise<MachineInfo> {
  return apiFetch<MachineInfo>("/machine");
}

export async function getSettings(): Promise<MachineSettings> {
  return apiFetch<MachineSettings>("/settings");
}

/**
 * Changes machine settings (POST /settings: send only the keys to change).
 * The Station only uses it for partial_retraction, which the user allowed.
 */
export async function updateSettings(patch: Partial<MachineSettings>): Promise<void> {
  await apiFetch<unknown>("/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// ── Profiles ─────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  return apiFetch<Profile[]>("/profile/list?full=true");
}

export async function loadProfileById(id: string): Promise<void> {
  await apiFetch<unknown>(`/profile/load/${encodeURIComponent(id)}`);
}

export async function loadProfileInline(profile: Profile): Promise<void> {
  await apiFetch<unknown>("/profile/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

/**
 * The official app's face on a shot ("like" / "dislike"), stored on the machine
 * (POST /history/rating/{id}). The id is the shot's string `id` (a UUID), not its
 * db_key: the machine answers 404 for a number (checked on the machine and in
 * Meticulous's backend, crates/backend/src/api/history.rs).
 */
export async function rateShot(shotId: string, rating: "like" | "dislike" | null): Promise<void> {
  await apiFetch<unknown>(`/history/rating/${encodeURIComponent(shotId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
}

/** The face set on a shot (official app or Station), or null */
export async function getShotRating(shotId: string): Promise<"like" | "dislike" | null> {
  // An unknown id also answers 200 with rating null
  const r = await apiFetch<{ rating?: string | null }>(`/history/rating/${encodeURIComponent(shotId)}`);
  return r.rating === "like" || r.rating === "dislike" ? r.rating : null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await apiFetch<unknown>("/profile/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}


// Returns the URL for a profile image (served by the machine)
export function getProfileImageUrl(imagePath: string): string {
  // imagePath is like "/api/v1/profile/image/abc123.png"; only ever an image on the machine itself
  return machineImageUrl(getBaseUrl(), imagePath) ?? "";
}

// ── History ──────────────────────────────────────────────────

export async function getHistory(
  maxResults = DEFAULT_HISTORY_RESULT_LIMIT,
): Promise<ShotEntry[]> {
  const limit = Math.max(1, Math.floor(maxResults));
  const res = await apiFetch<HistoryResponse>(
    `/history?max_results=${limit}`,
  );
  // Sort newest first
  return res.history.sort((a, b) => b.time - a.time);
}

/**
 * Many shots without their curves (dump_data=false): name, time, profile and
 * notes only, ~3 KB a shot instead of ~300 KB. For stats over months.
 */
export async function getHistoryLight(maxResults = 1000): Promise<ShotEntry[]> {
  const res = await apiFetch<HistoryResponse>(`/history?max_results=${Math.max(1, Math.floor(maxResults))}&dump_data=false`);
  return res.history.map((h) => ({ ...h, data: [] })).sort((a, b) => b.time - a.time);
}

/**
 * Shots of a time window with their curves (POST /history is the machine's
 * history search: it reads, it doesn't change anything). Ask a few days at a
 * time: each shot is ~300 KB.
 */
export async function searchHistory(startSec: number, endSec: number, maxResults = 200): Promise<ShotEntry[]> {
  const res = await apiFetch<HistoryResponse>("/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sort: "asc", max_results: maxResults, dump_data: true, start_date: startSec, end_date: endSec }),
  }, 90_000);
  return res.history ?? [];
}
/**
 * Puts the curves back on shots read without them (getHistoryLight): one small
 * search per shot, around its time. A shot that can't be read keeps no curve.
 */
export async function fillCurves(shots: ShotEntry[]): Promise<ShotEntry[]> {
  return Promise.all(shots.map(async (s) => {
    if (s.data?.length) return s;
    try {
      const found = await searchHistory(s.time - 2, s.time + 2, 5);
      return found.find((f) => f.id === s.id) ?? found.find((f) => f.db_key === s.db_key) ?? s;
    } catch {
      return s;
    }
  }));
}

/**
 * The machine's newest shots without curves, with the curves filled in only for
 * the ones `pick` chooses (the few the screen shows): ~200 KB instead of ~18 MB.
 */
export async function getHistoryPicked(maxResults: number, pick: (light: ShotEntry[]) => ShotEntry[]): Promise<ShotEntry[]> {
  const light = await getHistoryLight(maxResults);
  const full = await fillCurves(pick(light));
  return light.map((s) => full.find((f) => f.id === s.id) ?? s);
}

/**
 * Every shot's time (seconds), newest first, kept on this device and topped up
 * with the newest shots only. Read in full the first time, or when too many
 * shots are new to join the two lists.
 */
export async function getShotTimes(): Promise<number[]> {
  const KEY = "not9bar_shot_times_v1";
  let cached: number[] = [];
  try { cached = JSON.parse(localStorage.getItem(KEY) ?? "[]") as number[]; } catch { cached = []; }
  let times: number[];
  if (cached.length) {
    const fresh = (await getHistoryLight(50)).map((s) => s.time);
    const newest = cached[0];
    const added = fresh.filter((t) => t > newest);
    times = added.length < fresh.length ? [...added, ...cached] : (await getHistoryLight(100_000)).map((s) => s.time);
  } else {
    times = (await getHistoryLight(100_000)).map((s) => s.time);
  }
  try { localStorage.setItem(KEY, JSON.stringify(times)); } catch { /* a cache only */ }
  return times;
}

// ── Actions ──────────────────────────────────────────────────

export async function executeAction(action: ActionType): Promise<void> {
  await apiFetch<unknown>(`/action/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

// ── Notifications (machine messages, e.g. motor strain) ──────

export interface MachineNotification {
  id: string;
  message: string;
  /** data: URI, absolute URL or a path on the machine */
  image?: string | null;
  /** Buttons to show, e.g. ["Ok"] or ["Yes", "No"] */
  responses?: string[];
  timestamp?: string;
}

/** Unacknowledged notifications (read only). */
export async function getNotifications(): Promise<MachineNotification[]> {
  return apiFetch<MachineNotification[]>("/notifications?acknowledged=false");
}

/** Answer a notification, like tapping its button on the dial. */
export async function acknowledgeNotification(id: string, response: string): Promise<void> {
  await apiFetch<unknown>("/notifications/acknowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, response }),
  });
}

// ── Connection test ──────────────────────────────────────────

export async function testConnection(ip: string): Promise<MachineInfo> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    LOCAL_NETWORK_PERMISSION_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${machineBase(ip)}/api/v1/machine`, localNetworkRequestInit({
      signal: controller.signal,
    }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = (await res.json()) as MachineInfo;
    // Its network name, to find it by name next time (instant) before searching the network
    saveHostname(info.hostname);
    return info;
  } finally {
    clearTimeout(timer);
  }
}

// ── Shot stats helpers ────────────────────────────────────────

export function computeShotStats(frames: ShotFrame[]): ShotStats {
  if (!frames.length) {
    return {
      durationMs: 0,
      durationSec: 0,
      maxPressure: 0,
      maxFlow: 0,
      finalWeight: 0,
      avgTemp: 0,
      phases: [],
      dataPoints: 0,
    };
  }

  const first = frames[0];
  const last = frames[frames.length - 1];
  const durationMs = last.time - first.time;

  const pressures = frames.map((f) => f.shot.pressure).filter((v) => !isNaN(v));
  const flows = frames.map((f) => f.shot.flow).filter((v) => !isNaN(v));
  const weights = frames.map((f) => f.shot.weight).filter((v) => !isNaN(v) && v > 0);
  const temps = frames
    .map((f) => f.sensors?.bar_mid_up)
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  const phases = [...new Set(frames.map((f) => f.status))];

  return {
    durationMs,
    durationSec: Math.round(durationMs / 1000),
    maxPressure: pressures.length ? Math.max(...pressures) : 0,
    maxFlow: flows.length ? Math.max(...flows) : 0,
    // What reached the cup: the last drops in, a lifted or swapped cup out
    finalWeight: weights.length ? cupWeight(frames) : 0,
    avgTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0,
    phases,
    dataPoints: frames.length,
  };
}

// Downsample frames for chart rendering (target ~150 points)
export function downsampleFrames(frames: ShotFrame[], target = 150): ShotFrame[] {
  if (frames.length <= target) return frames;
  const step = Math.ceil(frames.length / target);
  return frames.filter((_, i) => i % step === 0);
}
