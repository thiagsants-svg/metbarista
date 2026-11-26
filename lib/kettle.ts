/**
 * Fellow Stagg EKG Pro kettle, read over the home Wi-Fi. READ ONLY: this file
 * only ever asks GET /temp (firmware 1.2.26+) or GET /cli?cmd=state (older),
 * which report the water temperature. The kettle's other commands (heating,
 * settings, Wi-Fi, reset) are never sent from here.
 *
 * Endpoints as found by the community (e.g. fabiankirchen/staggassistant and
 * tomtastic's firmware notes). The kettle has no password; it may not allow a
 * web page to read it (CORS): then the reading fails and the log says so.
 */

import { localNetworkRequestInit } from "./local-network";

const IP_KEY = "metbarista_kettle_ip";

export interface KettleReading {
  /** Water now (the kettle's unit, °C or °F); null when it's off its base */
  temp: number | null;
  /** Temperature set on the kettle */
  target: number | null;
  /** Its own words: "heating", "hold", "off"… */
  state: string | null;
  /** What came back, for the log */
  raw: string;
}

export const getKettleIp = () => (typeof window === "undefined" ? "" : localStorage.getItem(IP_KEY) ?? "");
export function setKettleIp(ip: string): void {
  const v = ip.trim();
  if (v) localStorage.setItem(IP_KEY, v); else localStorage.removeItem(IP_KEY);
}

/** A home-network address only (10.x, 172.16–31.x, 192.168.x, 169.254.x, or a .local name): nothing else is ever requested */
export function validKettleHost(ip: string): boolean {
  const v = ip.trim();
  if (/^[a-z0-9-]+\.local$/i.test(v)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > -10 && n < 230 ? Math.round(n * 10) / 10 : null;
};

/** /temp answer: JSON, sometimes with a bare nan (kettle lifted) */
export function parseTempJson(text: string): KettleReading | null {
  try {
    const d = JSON.parse(text.replace(/:\s*[-+]?nan\b/gi, ": null")) as Record<string, unknown>;
    if (!("temp" in d)) return null;
    return { temp: num(d.temp), target: num(d.temp_set), state: typeof d.state === "string" ? d.state : null, raw: text };
  } catch { return null; }
}

/** cli state answer: "… tempr=92.5 … temprT=96 … mode=…" */
export function parseCliState(text: string): KettleReading | null {
  const m = /\btempr(?![TB])\s*=\s*(-?[0-9.]+|[-+]?nan)/i.exec(text);
  if (!m) return null;
  const t = /\btemprT\s*=\s*(-?[0-9.]+)/i.exec(text);
  const mode = /\bmode\s*=\s*(\w+)/i.exec(text);
  return { temp: num(m[1]), target: t ? num(t[1]) : null, state: mode ? mode[1] : null, raw: text };
}

async function getText(url: string): Promise<{ status: number; text: string }> {
  // Marked as a home-network request, as the machine's are (Chrome asks once to allow it)
  const res = await fetch(url, localNetworkRequestInit({ method: "GET", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: AbortSignal.timeout(5000) }));
  return { status: res.status, text: await res.text() };
}

/** One reading; tries /temp, then the older /cli?cmd=state. `log` gets every step. */
export async function readKettle(ip: string, log: (line: string) => void = () => {}): Promise<KettleReading> {
  if (!validKettleHost(ip)) throw new Error("Type the kettle's local address, like 192.168.1.20");
  const host = ip.trim();
  for (const path of ["/temp", "/cli?cmd=state"]) {
    log(`GET http://${host}${path}`);
    try {
      const { status, text } = await getText(`http://${host}${path}`);
      log(`← ${status} ${text.slice(0, 300).replace(/\s+/g, " ")}`);
      if (status !== 200) continue;
      const r = path === "/temp" ? parseTempJson(text) : parseCliState(text);
      if (r) return r;
      log("couldn't find the temperature in that answer");
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      log(`error: ${msg}`);
      if (e instanceof TypeError) {
        log("The kettle didn't answer, or it doesn't let a web page read it (CORS). Check the address, and that this device is on the same Wi-Fi.");
      }
    }
  }
  throw new Error("No temperature from the kettle (see the log)");
}
