"use client";

/**
 * The purge's end, for the piston panel: the pressure coming down to rest
 * (~0.4 bar on the machine) is the cue to take the portafilter off. "Settling"
 * keeps the panel after the purge while the pressure is still up, until it
 * rests, the machine moves on (heating, a shot), or 60 s pass. `releaseFrom` is
 * where the pressure bar starts: the highest pressure seen once the piston is
 * at the bottom.
 */

import { useEffect, useRef, useState } from "react";
import { isHoming, isIdle } from "../brew-state";
import { pistonAtBottom, RESTING_BAR } from "@/components/station/purge-piston";
import type { LiveStatus } from "../types";

export function usePurgeRelease({ status, purging, pressureNow, pistonPos, demoPurge }: {
  status: LiveStatus | null;
  /** The machine is purging or raising the piston (or the ?demo=purge preview is) */
  purging: boolean;
  /** bar, live (or the demo's) */
  pressureNow: number | null;
  /** The piston's position, mm (only while purging) */
  pistonPos: number | null;
  /** The ?demo=purge phase, when previewing */
  demoPurge: "purge" | "home" | null;
}) {
  const [settling, setSettling] = useState(false);
  const wasPurgingRef = useRef(false);
  useEffect(() => {
    if (wasPurgingRef.current && !purging && (pressureNow ?? 0) > RESTING_BAR) setSettling(true);
    wasPurgingRef.current = purging;
  // Only when the purge ends; the pressure then is read as it is
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purging]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the machine's live state (an outside system)
    if (settling && ((pressureNow ?? 0) <= RESTING_BAR || purging || !isIdle(status))) setSettling(false);
  }, [settling, pressureNow, purging, status]);
  // A machine that rests a little above 0.4 bar (or a frozen reading) mustn't keep the panel up for good
  useEffect(() => {
    if (!settling) return;
    const id = setTimeout(() => setSettling(false), 60_000);
    return () => clearTimeout(id);
  }, [settling]);
  // The bar starts at the highest pressure seen once the piston is at the bottom
  const homing = demoPurge ? demoPurge === "home" : isHoming(status);
  const releasing = pistonAtBottom(pistonPos, homing) || homing || settling;
  const [releaseFrom, setReleaseFrom] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the machine's live state (an outside system)
    if (!releasing) { setReleaseFrom(null); return; }
    if (pressureNow != null) setReleaseFrom((f) => (f == null || pressureNow > f ? pressureNow : f));
  }, [releasing, pressureNow]);
  return { settling, homing, releaseFrom };
}
