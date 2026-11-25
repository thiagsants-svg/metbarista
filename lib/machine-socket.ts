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
 *
 * Several parts of the app can listen at once (the Station and the app's
 * status pill): each connectSocket() adds a listener, each disconnectSocket()
 * with the same handlers removes it, and the session closes with the last one.
 */

import type { LiveStatus, LiveTemperatures } from "./types";
import { machineBase } from "./machine-ip";
import {
  LOCAL_NETWORK_PERMISSION_TIMEOUT_MS,
  localNetworkRequestInit,
} from "./local-network";

type SocketEventMap = {
  status: (data: LiveStatus) => void;
  temperatures: (data: LiveTemperatures) => void;
  /** Preheat seconds remaining */
  heater: (secondsRemaining: number) => void;
  /** A machine message (the event's payload is JSON text) */
  notification: (n: { id: string; message: string; image?: string | null; responses?: string[] }) => void;
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
type Handlers = Partial<SocketEventMap>;
const listeners = new Set<Handlers>();
/** Calls the event on every listener */
const emit = {
  status: (d: LiveStatus) => listeners.forEach((h) => h.status?.(d)),
  temperatures: (d: LiveTemperatures) => listeners.forEach((h) => h.temperatures?.(d)),
  heater: (n: number) => listeners.forEach((h) => h.heater?.(n)),
  notification: (n: Parameters<SocketEventMap["notification"]>[0]) => listeners.forEach((h) => h.notification?.(n)),
  connect: () => listeners.forEach((h) => h.connect?.()),
  disconnect: () => listeners.forEach((h) => h.disconnect?.()),
};
let lastEventAt = 0;
let reopening: Promise<void> | null = null;
/** A poll is running; refreshNow() must not start a second one on the same session */
let polling = false;
/** After a failed reopen, wait before the next try (machine off or unreachable) */
let retryAt = 0;
let onVisibility: (() => void) | null = null;

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

/**
 * Open a socket.io session and join the default namespace; sets activeSid —
 * unless the page disconnected (or reconnected) meanwhile, in which case the
 * late session is dropped instead of becoming a stale activeSid.
 */
async function openSession(base: string, timeoutMs: number, gen: number): Promise<void> {
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
  if (stopped || gen !== generation) return;
  activeSid = sid;
  lastEventAt = Date.now();
}

/** Replace a dead session with a fresh one (one attempt at a time). */
function reopen(): Promise<void> {
  if (reopening || stopped || !activeBase || Date.now() < retryAt) return reopening ?? Promise.resolve();
  const base = activeBase;
  const gen = generation;
  emit.disconnect();
  reopening = openSession(base, 8000, gen)
    .then(() => { if (gen === generation && activeSid) emit.connect(); })
    .catch(() => { retryAt = Date.now() + 3000; /* unreachable — try again in a few seconds */ })
    .finally(() => { if (gen === generation) reopening = null; });
  return reopening;
}

async function doPoll(): Promise<void> {
  if (stopped || !activeBase || polling) return;
  const gen = generation;
  // No session yet (first open failed) or a dead one: keep trying to reopen
  if (!activeSid || Date.now() - lastEventAt > STALE_AFTER_MS) { await reopen(); return; }
  polling = true;
  try {
    const res = await fetch(`${activeBase}&sid=${activeSid}&t=${Date.now()}`, localNetworkRequestInit({
      signal: AbortSignal.timeout(5000),
    }));
    if (gen !== generation) return; // page disconnected meanwhile: drop this poll
    if (!res.ok) { await reopen(); return; }
    const raw = await res.text();
    if (gen !== generation) return;
    const { events, sessionGone } = parsePackets(raw);
    if (sessionGone) { await reopen(); return; }
    if (events.length) lastEventAt = Date.now();
    for (const [event, data] of events) {
      if (event === "status")       emit.status(data as LiveStatus);
      if (event === "sensors")      emit.temperatures(data as LiveTemperatures);
      if (event === "temperatures") emit.temperatures(data as LiveTemperatures);
      if (event === "heater_status" && typeof data === "number") emit.heater(data);
      if (event === "notification") {
        try {
          const n = typeof data === "string" ? JSON.parse(data) : data;
          if (n && typeof n.id === "string") emit.notification(n);
        } catch { /* malformed notification */ }
      }
    }
  } catch { /* network blip — the watchdog reopens if it lasts */ }
  finally { if (gen === generation) polling = false; }
}

export async function connectSocket(handlers: Handlers): Promise<void> {
  listeners.add(handlers);
  if (!stopped && activeBase) {
    // Already running: this listener joins it
    if (activeSid) handlers.connect?.();
    return;
  }
  stopped = false;
  const gen = ++generation;

  const machine = machineBase();
  if (!machine) throw new Error("Machine IP not configured");

  const base = `${machine}/socket.io/?EIO=4&transport=polling`;
  activeBase = base;

  // If the machine can't be reached now, the poll loop below keeps retrying
  try {
    await openSession(base, LOCAL_NETWORK_PERMISSION_TIMEOUT_MS, gen);
    if (activeSid) handlers.connect?.();
  } catch (e) {
    handlers.error?.(e instanceof Error ? e : new Error(String(e)));
  }
  // Disconnected (or reconnected) while the session was opening: leave nothing behind
  if (stopped || gen !== generation) return;

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

/** Removes a listener (all of them without an argument); the session stops with the last one */
export function disconnectSocket(handlers?: Handlers): void {
  if (handlers) listeners.delete(handlers);
  else listeners.clear();
  if (listeners.size > 0) return;
  stopped = true;
  generation++;
  reopening = null;
  polling = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (onVisibility) { document.removeEventListener("visibilitychange", onVisibility); onVisibility = null; }
  activeSid = null;
  activeBase = null;
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
