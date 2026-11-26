"use client";

/** Keeps the screen on while `on` (a brew with wet hands: no touches for minutes) */

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };

export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        const l = await nav.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {}); else lock = l;
      } catch { /* not allowed now: tried again when the page shows */ }
    };
    void acquire();
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
