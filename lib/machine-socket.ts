/**
 * Real-time live data from the Meticulous machine.
 *
 * Uses manual socket.io EIO4 HTTP-polling instead of the socket.io-client
 * library, which has trouble connecting through browsers on both HTTP and HTTPS.
 * Curl-verified: open → POST "40" → GET loop returns status events reliably.
 *
 * Sessions expire when the page stops polling for ~20 s (tablet screen off,
 * Chrome in the background). The machine then answers polls for the old sid
 * with a brand-new open packet instead of events, so a stale session would
 * silently freeze the UI. A watchdog reopens the session whenever no event
 * has arrived for a few seconds, and right away when the page becomes visible.
 */

import type { LiveStatus, LiveTemperatures } from "./types";
import {
  LOCAL_NETWORK_PERMISSION_TIMEOUT_MS,
  localNetworkRequestInit,
} from "./local-network";

type SocketEventMap = {
  status: (data: LiveStatus) => void;
  temperatures: (data: LiveTemperatures) => void;
  /** Preheat seconds remaining */
  heater: (secondsRemaining: number) => void;
  connect: () => void;
  disconnect: () => void;
  error: (err: Error) => void;
};

let pollTimer: ReturnType<typeof setTimeout> | null = null;
/** Delay between polls. Each GET returns everything buffered since the last one. */
const POLL_DELAY_MS = 150;
/** The machine sends status ~10×/s; this long without any event means the session is dead. */
const STALE_AFTER_MS = 5000;
/** Bumped on every connect/disconnect so an old poll loop stops itself. */
let generation = 0;
let activeSid: string | null = null;
let activeBase: string | null = null;
let stopped = false;
let activeHandlers: Partial<SocketEventMap> = {};
let lastEventAt = 0;
let reopening: Promise<void> | null = null;
let onVisibility: (() => void) | null = null;

function getMachineIp(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("metbarista_machine_ip");
}

/** Parse socket.io EIO4 polling body into [event, data] pairs; flags a dead session. */
function parsePackets(raw: string): { events: Array<[string, unknown]>; sessionGone: boolean } {
  const events: Array<[string, unknown]> = [];
  let sessionGone = false;
  for (const pkt of raw.split("\x1e")) {
    if (pkt === "2") {
      // ping — send pong asynchronously (fire and forget)
      if (activeSid && activeBase) {
        fetch(`${activeBase}&sid=${activeSid}`, localNetworkRequestInit({
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "3",
        })).catch(() => {});
      }
      continue;
    }
    // "0{...}" = the server opened a new session (ours expired); "1" = close
    if (pkt.startsWith("0{") || pkt === "1" || pkt.startsWith("41")) { sessionGone = true; continue; }
    if (!pkt.startsWith("42")) continue; // only message packets
    try {
      const arr = JSON.parse(pkt.slice(2));
      if (Array.isArray(arr) && arr.length >= 2) events.push([arr[0] as string, arr[1]]);
    } catch { /* skip malformed */ }
  }
  return { events, sessionGone };
}

/** Open a socket.io session and join the default namespace; sets activeSid. */
async function openSession(base: string, timeoutMs: number): Promise<void> {
  const openRes = await fetch(base, localNetworkRequestInit({ signal: AbortSignal.timeout(timeoutMs) }));
  if (!openRes.ok) throw new Error(`Open failed: ${openRes.status}`);
  const openRaw = await openRes.text();
  const jsonStart = openRaw.indexOf("{");
  if (jsonStart < 0) throw new Error("Bad open packet");
  const { sid } = JSON.parse(openRaw.slice(jsonStart)) as { sid: string };
  await fetch(`${base}&sid=${sid}`, localNetworkRequestInit({
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "40",
    signal: AbortSignal.timeout(6000),
  }));
  activeSid = sid;
  lastEventAt = Date.now();
}

/** Replace a dead session with a fresh one (one attempt at a time). */
function reopen(): Promise<void> {
  if (reopening || stopped || !activeBase) return reopening ?? Promise.resolve();
  const base = activeBase;
  activeHandlers.disconnect?.();
  reopening = openSession(base, 8000)
    .then(() => { activeHandlers.connect?.(); })
    .catch(() => { /* machine unreachable — the watchdog tries again */ })
    .finally(() => { reopening = null; });
  return reopening;
}

async function doPoll(): Promise<void> {
  if (stopped || !activeSid || !activeBase) return;
  if (Date.now() - lastEventAt > STALE_AFTER_MS) { await reopen(); return; }
  try {
    const res = await fetch(`${activeBase}&sid=${activeSid}&t=${Date.now()}`, localNetworkRequestInit({
      signal: AbortSignal.timeout(5000),
    }));
    if (!res.ok) { await reopen(); return; }
    const { events, sessionGone } = parsePackets(await res.text());
    if (sessionGone) { await reopen(); return; }
    if (events.length) lastEventAt = Date.now();
    for (const [event, data] of events) {
      if (event === "status")       activeHandlers.status?.(data as LiveStatus);
      if (event === "sensors")      activeHandlers.temperatures?.(data as LiveTemperatures);
      if (event === "temperatures") activeHandlers.temperatures?.(data as LiveTemperatures);
      if (event === "heater_status" && typeof data === "number") activeHandlers.heater?.(data);
    }
  } catch { /* network blip — the watchdog reopens if it lasts */ }
}

export async function connectSocket(handlers: Partial<SocketEventMap>): Promise<void> {
  if (activeSid) return; // already running
  stopped = false;
  const gen = ++generation;
  activeHandlers = handlers;

  const ip = getMachineIp();
  if (!ip) throw new Error("Machine IP not configured");

  const base = `http://${ip}/socket.io/?EIO=4&transport=polling`;
  activeBase = base;

  await openSession(base, LOCAL_NETWORK_PERMISSION_TIMEOUT_MS);
  handlers.connect?.();

  // Coming back from a sleeping screen or another app: reconnect immediately
  onVisibility = () => {
    if (document.visibilityState === "visible" && Date.now() - lastEventAt > 2000) reopen();
  };
  document.addEventListener("visibilitychange", onVisibility);

  // Poll in a loop; the next poll starts only after the previous one finished,
  // so slow responses never pile up.
  const loop = async () => {
    await doPoll();
    if (!stopped && gen === generation) pollTimer = setTimeout(loop, POLL_DELAY_MS);
  };
  await loop();
}

export function disconnectSocket(): void {
  stopped = true;
  generation++;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (onVisibility) { document.removeEventListener("visibilitychange", onVisibility); onVisibility = null; }
  activeSid = null;
  activeBase = null;
  activeHandlers = {};
}

export function isSocketConnected(): boolean {
  return activeSid !== null;
}

/** Force an immediate poll — call after actions to get instant feedback */
export function refreshNow(): void {
  doPoll();
}

// Not used with polling but kept for API compat
export function sendAction(_action: string): void { /* no-op */ }
