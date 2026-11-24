"use client";

import { useEffect } from "react";

// ── Keep the tablet screen on, and the page from scrolling ─────────────────────

export function useStationScreen() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (!nav.wakeLock) return;
      try {
        const l = await nav.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch { /* not allowed (e.g. page hidden) — retried on visibility */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
      [html.style.overflow, document.body.style.overflow] = prev;
    };
  }, []);
}
