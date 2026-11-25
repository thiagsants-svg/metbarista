/**
 * Firmware and company news, ahead of the Atom feeds (which lag the Discord):
 *
 * - Firmware: Meticulous tags every release on GitHub, in the repository that
 *   builds the machine's image (meticulous-machine), as "<channel>/<version>",
 *   e.g. "stable/2026M1556-stable". The number after "M" grows with each build.
 *   The machine says its own channel and version (GET /api/v1/machine, read only).
 * - Company updates: the newest entry of the updates feed, against the last one
 *   seen on this tablet.
 *
 * GitHub allows 60 unauthenticated reads an hour per address: the answers are
 * kept here for 6 hours.
 */

const REPO_TAGS = "https://api.github.com/repos/MeticulousHome/meticulous-machine/git/matching-refs/tags";
const CACHE_MS = 6 * 3600_000;
export const CHANNELS = ["stable", "beta", "nightly"] as const;
export type Channel = (typeof CHANNELS)[number];

/** "2026M1556-stable" → 1556 (the build number); null when it doesn't read like one */
export function buildNumber(version: string | null | undefined): number | null {
  const m = /M(\d+)/.exec(version ?? "");
  return m ? Number(m[1]) : null;
}

/** The newest version among GitHub tag refs ("refs/tags/beta/2026M1547-beta") */
export function newestFromRefs(refs: string[]): string | null {
  let best: string | null = null;
  for (const ref of refs) {
    const v = ref.split("/").pop() ?? "";
    const n = buildNumber(v);
    if (n != null && (best == null || n > (buildNumber(best) ?? -1))) best = v;
  }
  return best;
}

function cached<T>(key: string): T | null {
  try {
    const c = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; value: T } | null;
    return c && Date.now() - c.at < CACHE_MS ? c.value : null;
  } catch {
    return null;
  }
}
function keep<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch { /* a cache only */ }
}

/** The newest firmware published on a channel ("2026M1558-nightly"), or null if GitHub can't be read */
export async function latestFirmware(channel: Channel): Promise<string | null> {
  const key = `not9bar_fw_latest_${channel}`;
  const hit = cached<string>(key);
  if (hit) return hit;
  try {
    const res = await fetch(`${REPO_TAGS}/${channel}`, { signal: AbortSignal.timeout(8000), credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) return null;
    const refs = ((await res.json()) as { ref: string }[]).map((r) => r.ref);
    const newest = newestFromRefs(refs);
    if (newest) keep(key, newest);
    return newest;
  } catch {
    return null;
  }
}

/** The newest of every channel, for the Community page */
export async function latestPerChannel(): Promise<Record<Channel, string | null>> {
  const all = await Promise.all(CHANNELS.map((c) => latestFirmware(c)));
  return { stable: all[0], beta: all[1], nightly: all[2] };
}

export interface FirmwareNews {
  channel: string;
  current: string;
  latest: string;
}

/**
 * A newer firmware on the machine's own channel, or null. `info` is what the
 * machine says about itself (its channel and image version).
 */
export async function firmwareNews(info: { image_build_channel?: string; image_version?: string } | null): Promise<FirmwareNews | null> {
  const channel = info?.image_build_channel;
  const current = info?.image_version;
  if (!channel || !current || !(CHANNELS as readonly string[]).includes(channel)) return null;
  const latest = await latestFirmware(channel as Channel);
  const a = buildNumber(current), b = buildNumber(latest);
  return latest && a != null && b != null && b > a ? { channel, current, latest } : null;
}

// ── Company updates ──

export const FEED_PROXY = "https://metbarista-feed-proxy.metbarista.workers.dev/?url=";
export const COMPANY_FEED = "https://meticuloushome.com/blogs/updates.atom";

/** The newest company update's title (through MetBarista's feed proxy), or null */
export async function newestCompanyTitle(): Promise<string | null> {
  const key = "not9bar_company_newest";
  const hit = cached<string>(key);
  if (hit) return hit;
  try {
    const res = await fetch(FEED_PROXY + encodeURIComponent(COMPANY_FEED), { signal: AbortSignal.timeout(8000) });
    const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
    const title = doc.querySelector("entry > title")?.textContent?.trim() || null;
    if (title) keep(key, title);
    return title;
  } catch {
    return null;
  }
}

const SEEN_KEY = "not9bar_seen_company_update";

/** Marks the newest company update as seen (the Community page calls this) */
export function markCompanyUpdateSeen(title: string): void {
  try { localStorage.setItem(SEEN_KEY, title); } catch { /* nothing to keep */ }
}

/** The newest company update's title when it wasn't seen on this tablet yet (first visit: none) */
export function unseenCompanyUpdate(newestTitle: string | null): string | null {
  if (!newestTitle) return null;
  const seen = localStorage.getItem(SEEN_KEY);
  if (seen == null) { markCompanyUpdateSeen(newestTitle); return null; }
  return seen === newestTitle ? null : newestTitle;
}
