/**
 * How many devices use Not Nine Bar each day, anonymously: each device adds 1
 * to the day's total the first time it opens the site that day ("d"), and 1 to
 * another when the Station connects to a machine ("s", real Meticulous
 * owners). Two more, once each: "new device" the first time a browser opens
 * the site, and a machine's short code the first time this browser sees that
 * machine (countMachine), so a home with three devices and one machine counts
 * as one machine. Nothing else is sent: no name, no coffee. The totals
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

const OPT_OUT = "not9bar_no_count";

/** "Don't count my use", set on the Usage page */
export function countingOff(): boolean {
  try { return localStorage.getItem(OPT_OUT) === "1"; } catch { return true; }
}
export function setCountingOff(off: boolean): void {
  try { if (off) localStorage.setItem(OPT_OUT, "1"); else localStorage.removeItem(OPT_OUT); } catch { /* storage blocked */ }
}

function counting(): boolean {
  if (typeof window === "undefined" || window.location.hostname !== SITE_HOST) return false;
  if (new URLSearchParams(window.location.search).has("demo")) return false;
  return !countingOff();
}

/**
 * The machine's short code: the first 4 hex digits (16 bits) of
 * SHA-256("not9bar-machine-v1:" + serial). 65,536 codes only: many serials
 * share each one, so the code can't be turned back into a serial. It is
 * enough to count machines (the Worker corrects for the rare shared codes).
 */
export async function machineCode(serial: string): Promise<string> {
  const bytes = new TextEncoder().encode(`not9bar-machine-v1:${serial.trim()}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash.subarray(0, 2), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function postOnce(flag: string, path: string, body?: unknown): Promise<void> {
  try { if (localStorage.getItem(flag)) return; } catch { return; }
  const g = globalThis as Record<string, unknown>;
  if (g[`${flag}_busy`]) return;
  g[`${flag}_busy`] = true;
  try {
    const res = await fetch(`${API}${path}`, {
      ...OPTS, method: "POST", signal: AbortSignal.timeout(8000),
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    if (res.ok) { try { localStorage.setItem(flag, "1"); } catch { /* storage blocked */ } }
  } catch { /* offline: tries again next time */ } finally {
    g[`${flag}_busy`] = false;
  }
}

/** This browser, once ever: the count of different devices */
export async function countNewDevice(): Promise<void> {
  if (!counting()) return;
  await postOnce("not9bar_counted_new", "/hit/n");
}

/** This machine, once per browser: only its short code is sent (see machineCode) */
export async function countMachine(serial: string | null | undefined): Promise<void> {
  if (!serial?.trim() || !counting()) return;
  const code = await machineCode(serial);
  await postOnce(`not9bar_counted_m_${code}`, "/hit/m", { c: code });
}

/** Adds this device to today's count, once a day (marked counted only when it went through) */
export async function countUse(kind: UsageKind): Promise<void> {
  if (!counting()) return;
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

export interface UsageTotals {
  /** Different machines seen (estimated from the short codes) */
  machines: number;
  /** Different browsers that opened the site */
  devices: number;
}

/** Totals since the count of machines and devices began */
export async function readTotals(): Promise<UsageTotals> {
  const res = await fetch(`${API}/totals`, { ...OPTS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UsageTotals;
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
