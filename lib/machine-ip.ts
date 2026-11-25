/**
 * Where the machine is: its IP, kept in this browser, and the base URL every
 * request and the live socket start from. The one place to change how a fork
 * finds its machine (another port, https, a hostname).
 */

const IP_KEY = "metbarista_machine_ip";

export function getSavedIp(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(IP_KEY) ?? "";
}

export function saveIp(ip: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IP_KEY, ip);
}

export function clearIp(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(IP_KEY);
}

const HOST_KEY = "metbarista_machine_host";

/** The machine's own network name (e.g. "meticulousPlushBrewing-001822"): kept to find it fast */
export function getSavedHostname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(HOST_KEY) ?? "";
}

export function saveHostname(name: string | null | undefined): void {
  if (typeof window === "undefined" || !name || !/^[A-Za-z0-9-]+$/.test(name)) return;
  localStorage.setItem(HOST_KEY, name);
}

/** "http://192.168.1.20" for the saved IP (or the one given); "" when there is none */
export function machineBase(ip: string = getSavedIp()): string {
  return ip ? `http://${ip}` : "";
}
