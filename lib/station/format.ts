/** Station: colors, labels and number formats (no state) */

import { isExtracting, isHeating, isIdle, isWaitingForUser, isWaitingForWater } from "@/lib/brew-state";
import type { LiveStatus, LiveTemperatures } from "@/lib/types";

/**
 * Color themes, applied as CSS variables on the Station root: light (the
 * official app's paper with yellow and black) and dark bumblebee (black and
 * yellow). Every Station color reads these variables.
 */
export const THEMES = {
  light: {
    // Bumblebee on paper: solid yellow fills with black text; darker amber for text and lines
    "--paper": "#ebeae6", "--ink": "#111111", "--accent": "#8a6200",
    "--primary": "#ffc400", "--on-primary": "#111111", "--stop": "#d62828",
    "--heat": "#c2410c", "--water": "#0369a1", "--weight": "#1d4ed8", "--grav": "#8a8a85", "--temp": "#8a6200",
    "--h0": "#8a6200", "--h1": "#111111", "--h2": "#55554f", "--h3": "#8f8e88", "--h4": "#b9b7b0",
    "--h5": "#1d4ed8", "--h6": "#7aa2f7",
    // Status text and tints: OK, soon, due (dark enough to read on paper)
    "--good": "#047857", "--warn": "#92400e", "--bad": "#9a3412",
  },
  dark: {
    "--paper": "#0a0a0a", "--ink": "#fafafa", "--accent": "#ffc400",
    "--primary": "#ffc400", "--on-primary": "#0a0a0a", "--stop": "#ef4444",
    "--heat": "#ff8a00", "--water": "#38bdf8", "--weight": "#38bdf8", "--grav": "#ff8a00", "--temp": "#f43f5e",
    "--h0": "#ff8a00", "--h1": "#ffe066", "--h2": "#ffc400", "--h3": "#f43f5e", "--h4": "#c084fc",
    "--h5": "#38bdf8", "--h6": "#2dd4bf",
    // Light enough to read on black
    "--good": "#34d399", "--warn": "#fbbf24", "--bad": "#fb923c",
  },
} as const;
export type ThemeName = keyof typeof THEMES;

/** Group/external temperatures from the machine's "sensors" event (names vary by firmware). */
export function groupTempsFor(g: Partial<LiveTemperatures>) {
  const r = g as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    barUp: num(r.t_bar_up), barMidUp: num(r.t_bar_mid_up ?? r.t_bar_mu),
    barMidDown: num(r.t_bar_mid_down ?? r.t_bar_md), barDown: num(r.t_bar_down),
    ext1: num(r.t_external_1 ?? r.t_ext_1), ext2: num(r.t_external_2 ?? r.t_ext_2),
  };
}

/** Gravimetric flow (g/s) from the last ~1 s of scale readings (fallback only). */
export function gravFlow(samples: { t: number; w: number }[]): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const first = samples.find((x) => last.t - x.t <= 1200) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.3) return null;
  return Math.max(0, (last.w - first.w) / dt);
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  heating: "Heating",
  "click to start": "Ready to brew",
  "pour water and click to continue": "Add water",
  "click to purge": "Ready to purge",
  purge: "Purging",
  home: "Raising",
  retracting: "Retracting",
  "closing valve": "Closing valve",
  "starting...": "Starting",
};

export function statusLabel(s: LiveStatus | null, connected: boolean): string {
  if (!connected) return "Connecting…";
  if (!s) return "Waiting for machine…";
  if (isExtracting(s)) return s.name ? `Brewing · ${s.name}` : "Brewing";
  return STATUS_LABELS[(s.name ?? "").toLowerCase()] ?? s.name ?? "—";
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmt(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

export interface StatusPill { text: string; className: string; pulsing: boolean }

/** The machine-state pill in the app's top bar (the same on every page) */
export function statusPill(status: LiveStatus | null, connected: boolean, preheatLeft: number, hasMachine = true): StatusPill {
  if (!hasMachine) return { text: "No machine", className: "bg-[var(--ink)]/[0.05] text-[var(--ink)]/70", pulsing: false };
  const brewing = isExtracting(status);
  const needsWater = isWaitingForWater(status);
  const waiting = isWaitingForUser(status) && !needsWater;
  const heating = isHeating(status);
  const preheating = preheatLeft > 0;
  return {
    text: preheating && isIdle(status) ? `Preheating ${fmtClock(preheatLeft)}` : statusLabel(status, connected),
    className:
      !connected ? "bg-[var(--ink)]/[0.05] text-[var(--ink)]/70"
      : brewing || waiting ? "bg-[var(--ink)]/[0.06] text-[var(--accent)]"
      : needsWater ? "bg-[var(--water)]/15 text-[var(--water)]"
      : heating || preheating ? "bg-[var(--ink)]/[0.06] text-[var(--accent)]"
      : "bg-[var(--ink)]/[0.05] text-[var(--ink)]/70",
    pulsing: brewing || heating || waiting || needsWater || preheating,
  };
}
