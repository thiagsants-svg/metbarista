/**
 * How many devices use Not Nine Bar each day, anonymously: each device adds 1
 * to the day's total the first time it opens the site that day ("d"), and 1 to
 * another when the Station connects to a machine ("s", real Meticulous
 * owners). Nothing else is sent: no name, no machine, no coffee. The totals
 * live on the project's own Cloudflare Worker (cloudflare/count-worker.js,
 * at count.not9bar.com). Only the published site counts, never development
 * or a demo.
 */

const API = "https://count.not9bar.com";
const SITE_HOST = "not9bar.com";

export type UsageKind = "d" | "s";

/** The day in UTC, the same for everyone: "2026-11-24" */
export const usageDay = (d = new Date()) => d.toISOString().slice(0, 10);

const OPTS: RequestInit = { credentials: "omit", referrerPolicy: "no-referrer" };

/** Adds this device to today's count, once a day (marked counted only when it went through) */
export async function countUse(kind: UsageKind): Promise<void> {
  if (typeof window === "undefined" || window.location.hostname !== SITE_HOST) return;
  if (new URLSearchParams(window.location.search).has("demo")) return;
  // Not "metbarista_": stays out of backups
  const flag = `not9bar_counted_${kind}`;
  const today = usageDay();
  try { if (localStorage.getItem(flag) === today) return; } catch { return; }
  // The same page asking twice (two effects at once)
  const busy = `${flag}_busy`;
  const g = globalThis as Record<string, unknown>;
  if (g[busy]) return;
  g[busy] = true;
  try {
    const res = await fetch(`${API}/hit/${kind}`, { ...OPTS, method: "POST", signal: AbortSignal.timeout(8000) });
    if (res.ok) { try { localStorage.setItem(flag, today); } catch { /* storage blocked */ } }
  } catch { /* offline: tries again next time */ } finally {
    g[busy] = false;
  }
}

export interface UsageDay { day: string; devices: number; station: number }

/** The last `days` days, newest first */
export async function readUsage(days = 14): Promise<UsageDay[]> {
  const res = await fetch(`${API}/days?n=${days}`, { ...OPTS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = (await res.json()) as { day: string; d: number; s: number }[];
  return list.map((x) => ({ day: x.day, devices: x.d, station: x.s }));
}

export interface UsageSummary {
  today: { d: number; s: number };
  week: { d: number; s: number };
  /** Cloudflare Web Analytics, last 7 days (null until set up on the Worker) */
  web: { visits: number; pageViews: number } | null;
}

/** Today and the last 7 days, for the home page */
export async function readSummary(): Promise<UsageSummary> {
  const res = await fetch(`${API}/summary`, { ...OPTS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UsageSummary;
}
