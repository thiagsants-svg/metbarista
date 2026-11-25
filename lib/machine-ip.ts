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

/** "http://192.168.1.20" for the saved IP (or the one given); "" when there is none */
export function machineBase(ip: string = getSavedIp()): string {
  return ip ? `http://${ip}` : "";
}
