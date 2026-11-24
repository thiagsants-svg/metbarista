"use client";

/**
 * The Station's light / dark choice, shared by the other pages (same saved
 * value), with the CSS variables to put on a page's root.
 */

import { useSyncExternalStore, type CSSProperties } from "react";
import { THEMES, type ThemeName } from "@/lib/station/format";

const KEY = "metbarista_theme";
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) fn(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

const read = (): ThemeName => (localStorage.getItem(KEY) === "dark" ? "dark" : "light");

export function useStationTheme(): { theme: ThemeName; style: CSSProperties; toggle: () => void } {
  // Pre-rendered pages start light, like the Station
  const theme = useSyncExternalStore(subscribe, read, () => "light" as ThemeName);
  return {
    theme,
    style: THEMES[theme] as unknown as CSSProperties,
    toggle: () => {
      localStorage.setItem(KEY, theme === "dark" ? "light" : "dark");
      listeners.forEach((fn) => fn());
    },
  };
}
