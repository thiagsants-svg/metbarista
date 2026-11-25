"use client";

/**
 * The Station's offline previews (no machine): /station/?demo shows a finished
 * shot, ?demo=pour plays it in real time, ?demo=heat the heating view,
 * ?demo=purge the piston going down and back up, ?demo=rate / purge-rate the
 * rating popup. Kept out of the Station page; the page owns the state, these
 * fill and play it.
 */

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { HeatPoint, ShotPoint } from "@/components/shot-charts";
import { PISTON_TRAVEL_MM } from "@/components/station/purge-piston";
import { demoShot } from "@/lib/demo-shot";

type Set<T> = Dispatch<SetStateAction<T>>;

/** Fills the page's state for the ?demo=… asked in the URL (nothing for none) */
export function applyDemo(demoParam: string | null, s: {
  setDemo: Set<boolean>; setDemoHeat: Set<boolean>; setDemoPurge: Set<"purge" | "home" | null>;
  setDemoPour: Set<ShotPoint[] | null>; setDemoEnd: Set<ShotPoint | null>; setHeatSamples: Set<HeatPoint[]>;
  setSetTemp: Set<number | null>; setTargetWeight: Set<number | null>; setData: Set<ShotPoint[]>; setElapsed: Set<number>;
}): void {
  if (demoParam === null) return;
  if (demoParam === "purge" || demoParam === "purge-rate") { s.setDemoPurge("purge"); return; }
  if (demoParam === "heat") {
    s.setDemoHeat(true);
    s.setHeatSamples(Array.from({ length: 90 }, (_, i) => {
      const k = 1 - Math.exp(-i / 55);
      return {
        t: i * 2, temp: 40 + 45 * k, barUp: 39 + 50 * k, barMidUp: 39 + 47 * k,
        barMidDown: 40 + 42 * k, barDown: 41 + 36 * k, ext1: 39 + 30 * k, ext2: 39 + 28 * k,
      };
    }));
    s.setSetTemp(94);
    return;
  }
  const pts = demoShot();
  s.setDemo(true);
  s.setTargetWeight(40);
  s.setSetTemp(94);
  if (demoParam === "pour") {
    // Plays the shot in real time, to watch the glass fill
    s.setDemoPour(pts);
  } else {
    s.setData(pts);
    s.setElapsed(pts[pts.length - 1].t / 1000);
    s.setDemoEnd(pts[pts.length - 1]);
  }
}

/** Plays the ?demo=purge piston and the ?demo=pour shot */
export function useStationDemoPlayback({
  demoPurgeOn, setDemoPurge, setDemoPressure, setPistonPos, demoPour, setDemoPour, setData, setElapsed, setDemoEnd,
}: {
  demoPurgeOn: boolean;
  setDemoPurge: Set<"purge" | "home" | null>;
  setDemoPressure: Set<number | null>;
  setPistonPos: Set<number | null>;
  demoPour: ShotPoint[] | null;
  setDemoPour: Set<ShotPoint[] | null>;
  setData: Set<ShotPoint[]>;
  setElapsed: Set<number>;
  setDemoEnd: Set<ShotPoint | null>;
}) {
  useEffect(() => {
    if (!demoPurgeOn) return;
    // A reading every ~150 ms, like the machine's
    const t0 = Date.now();
    const id = setInterval(() => {
      // Down in 10 s, 6 s at the bottom while the pressure comes down, back up in 8 s
      const t = ((Date.now() - t0) / 1000) % 24;
      const purge = t < 16;
      setDemoPurge(purge ? "purge" : "home");
      // About 2.5 bar while it pushes, down to rest in the 6 s at the bottom
      setDemoPressure(t < 10 ? 2.5 : t < 15 ? 2.5 - ((t - 10) / 5) * 2.1 : 0.4);
      setPistonPos(t < 10 ? (t / 10) * PISTON_TRAVEL_MM : purge ? PISTON_TRAVEL_MM : Math.max(0, (1 - (t - 16) / 8) * PISTON_TRAVEL_MM));
    }, 150);
    return () => clearInterval(id);
  // Started once by ?demo=purge; the phase it sets doesn't restart it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPurgeOn]);

  useEffect(() => {
    if (!demoPour) return;
    // &at=25 skips the first seconds of the simulated shot
    const at = Number(new URLSearchParams(window.location.search).get("at")) || 0;
    let i = Math.max(0, Math.min(demoPour.length - 1, Math.round(at * 5)));
    const id = setInterval(() => {
      i += 1;
      const point = demoPour[i - 1];
      setData(demoPour.slice(0, i));
      setElapsed(point.t / 1000);
      setDemoEnd(point);
      if (i >= demoPour.length) { clearInterval(id); setDemoPour(null); }
    }, 200); // the demo shot has a point every 200 ms
    return () => clearInterval(id);
  }, [demoPour, setData, setElapsed, setDemoPour, setDemoEnd]);
}
