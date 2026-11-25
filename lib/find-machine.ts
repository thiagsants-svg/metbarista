/**
 * Finds a Meticulous on the local network, read only: asks addresses whether
 * they are one (GET /api/v1/settings). The browser can't tell the tablet's own
 * IP (Chrome hides it), so the search guesses the network range:
 *
 * 1. By the machine's saved network name ("<hostname>.local"), instantly where it resolves.
 * 2. One first request that waits for Chrome's "local network" permission question.
 * 3. The last known range, then the usual home ranges, two ranges at a time. As
 *    soon as any device answers in a range (the router, a phone), that range is
 *    the network: it is searched first and the others wait.
 * 4. Inside a range, the likeliest addresses first.
 */

import { LOCAL_NETWORK_PERMISSION_TIMEOUT_MS, localNetworkRequestInit } from "./local-network";
import { getSavedHostname } from "./machine-ip";

export interface FoundMachine { ip: string; name: string }

export interface SearchProgress {
  /** Addresses asked so far, over all ranges */
  done: number;
  /** Addresses to ask in all */
  total: number;
  /** The ranges being searched now ("192.168.1"), or the name being tried */
  current: string[];
  /** A range where some device answered: the tablet's own network, most likely */
  network: string | null;
  /** Waiting for the answer to Chrome's local-network question */
  askingPermission: boolean;
}

const COMMON_RANGES = [
  "192.168.1", "192.168.0", "10.0.0", "192.168.15", "192.168.68", "192.168.2",
  "192.168.100", "10.0.1", "192.168.10", "192.168.50", "192.168.3", "192.168.88",
];
const PARALLEL = 32;
const TIMEOUT_MS = 2500;

/** "192.168.1.42" → "192.168.1"; anything else → null */
export function rangeOf(ip: string | null | undefined): string | null {
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec((ip ?? "").trim());
  return m ? m[1] : null;
}

/** The ranges to search, the last known one first */
export function rangesFor(lastIp?: string | null): string[] {
  const own = rangeOf(lastIp);
  return own ? [own, ...COMMON_RANGES.filter((r) => r !== own)] : COMMON_RANGES;
}

/**
 * The addresses of a range, most likely first: the last known address and its
 * neighbours, then the usual router pools (from .2, and from .100), then the
 * rest; .1 (the router itself) last.
 */
export function addressesInOrder(range: string, lastIp?: string | null): string[] {
  const order: number[] = [];
  const add = (n: number) => { if (n >= 2 && n <= 254 && !order.includes(n)) order.push(n); };
  const last = rangeOf(lastIp) === range ? Number((lastIp ?? "").split(".")[3]) : NaN;
  if (Number.isFinite(last)) {
    add(last);
    for (let d = 1; d <= 10; d++) { add(last + d); add(last - d); }
  }
  for (let n = 2; n <= 60; n++) add(n);
  for (let n = 100; n <= 160; n++) add(n);
  for (let n = 61; n <= 99; n++) add(n);
  for (let n = 161; n <= 254; n++) add(n);
  order.push(1);
  return order.map((n) => `${range}.${n}`);
}

type Probe = { machine: FoundMachine | null; alive: boolean };

/**
 * Asks /api/v1/settings: it answers in milliseconds even while dozens of other
 * addresses are being tried (/api/v1/machine takes ~300 ms and timed out under
 * that load). A Meticulous is recognised by its own settings' names. Any HTTP
 * answer from another device says the range is the network.
 */
async function probe(host: string, signal: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<Probe> {
  try {
    const res = await fetch(`http://${host}/api/v1/settings`, localNetworkRequestInit({
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    }));
    if (!res.ok) return { machine: null, alive: true };
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j || typeof j !== "object" || !("partial_retraction" in j || "auto_purge_after_shot" in j)) return { machine: null, alive: true };
    // Its name, for the message (not needed to connect)
    const info = await fetch(`http://${host}/api/v1/machine`, localNetworkRequestInit({ signal: AbortSignal.timeout(5000) }))
      .then((r) => r.json() as Promise<{ name?: string }>).catch(() => null);
    return { machine: { ip: host, name: info?.name ?? "Meticulous" }, alive: true };
  } catch {
    // A failure says nothing for sure (another range's router can refuse fast too):
    // only a real HTTP answer marks the range as the network
    return { machine: null, alive: false };
  }
}

export async function findMachine(
  lastIp: string | null | undefined,
  onProgress: (p: SearchProgress) => void,
  signal: AbortSignal,
): Promise<FoundMachine | null> {
  const ranges = rangesFor(lastIp);
  const total = ranges.length * 254;
  let done = 0;
  let network: string | null = null;
  const report = (current: string[], askingPermission = false) =>
    onProgress({ done, total, current, network, askingPermission });

  // 1. By name, where .local names resolve (saved after a first connection)
  const host = getSavedHostname();
  if (host) {
    report([`${host}.local`]);
    const byName = await probe(`${host}.local`, signal, 4000);
    if (byName.machine) return byName.machine;
  }
  if (signal.aborted) return null;

  // 2. One request that may raise Chrome's permission question: wait for the answer
  // Asked of the router (.1), which answers or refuses quickly; an old machine IP could hang
  const first = `${ranges[0]}.1`;
  report([ranges[0]], true);
  const asked = await probe(first, signal, Math.min(15_000, LOCAL_NETWORK_PERMISSION_TIMEOUT_MS));
  if (asked.machine) return asked.machine;
  if (asked.alive) network = rangeOf(first);

  // 3. The ranges, two at a time; a range where something answered goes first
  const queues = new Map(ranges.map((r) => [r, addressesInOrder(r, lastIp)]));
  const active: string[] = [];
  const refill = () => {
    for (const r of [...active]) if (!queues.get(r)?.length) active.splice(active.indexOf(r), 1);
    while (active.length < 2) {
      const next = ranges.find((r) => !active.includes(r) && (queues.get(r)?.length ?? 0) > 0);
      if (!next) break;
      active.push(next);
    }
  };
  const nextAddress = (): string | null => {
    refill();
    if (network && queues.get(network)?.length) return queues.get(network)!.shift()!;
    if (!active.length) return null;
    // Alternate between the two active ranges
    active.push(active.shift()!);
    return queues.get(active[active.length - 1])!.shift() ?? null;
  };

  let found: FoundMachine | null = null;
  const stop = new AbortController();
  const both = AbortSignal.any([signal, stop.signal]);
  const worker = async () => {
    while (!found && !both.aborted) {
      const ip = nextAddress();
      if (!ip) return;
      const r = await probe(ip, both);
      done++;
      if (r.alive && !network) network = rangeOf(ip);
      report(network ? [network] : [...active]);
      if (r.machine && !found) { found = r.machine; stop.abort(); }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return found;
}
