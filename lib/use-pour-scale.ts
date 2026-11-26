"use client";

/**
 * The machine's scale, read live for pour-over (status events, ~10 a second).
 * Read only: no tare is sent, the page keeps its own zero.
 */

import { useEffect, useRef, useState } from "react";
import { connectSocket, disconnectSocket } from "./machine-socket";
import { readingsOf } from "./station/readings";
import { isExtracting } from "./brew-state";
import type { Sample } from "./pour-over";

export function usePourScale(onSample: (s: Sample) => void) {
  const [weight, setWeight] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  /** The machine is brewing or heating: its scale belongs to the shot */
  const [busy, setBusy] = useState(false);
  const cb = useRef(onSample);
  useEffect(() => { cb.current = onSample; }, [onSample]);

  useEffect(() => {
    let lastShown = 0;
    let lastT = performance.now() / 1000;
    let batch: number[] = [];
    // Events of one poll arrive together: spread them over the time since the last batch
    const flush = () => {
      const now = performance.now() / 1000;
      const n = batch.length;
      const span = Math.min(1.5, Math.max(0.05 * n, now - lastT));
      batch.forEach((w, i) => cb.current({ t: now - span + (span * (i + 1)) / n, w }));
      lastT = now;
      if (now - lastShown >= 0.1) { lastShown = now; setWeight(batch[n - 1]); }
      batch = [];
    };
    const handlers = {
      status: (s: Parameters<typeof readingsOf>[0]) => {
        setBusy(isExtracting(s));
        const w = readingsOf(s).weight;
        if (w == null) return;
        if (!batch.length) queueMicrotask(flush);
        batch.push(w);
      },
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
    };
    // ?demo: a made-up scale (server, brewer, coffee, then a bloom and two pours, then the lift)
    if (new URLSearchParams(window.location.search).has("demo")) {
      const t0 = performance.now() / 1000;
      const id = setInterval(() => {
        const e = performance.now() / 1000 - t0;
        const pour = (from: number, grams: number, secs: number) => Math.min(grams, Math.max(0, (e - from) / secs * grams));
        const water = pour(70, 45, 10) + pour(115, 105, 15) + pour(160, 90, 15);
        const w = e < 20 ? 300 : e < 40 ? 450 : e < 60 ? 465 : e < 200 ? 465 + water : 300 + 205;
        handlers.status({ sensors: { w: w + (Math.random() - 0.5) * 0.2 } } as unknown as Parameters<typeof readingsOf>[0]);
      }, 100);
      setTimeout(() => setConnected(true), 0);
      return () => clearInterval(id);
    }
    connectSocket(handlers).catch(() => setConnected(false));
    return () => disconnectSocket(handlers);
  }, []);

  return { weight, connected, busy };
}
