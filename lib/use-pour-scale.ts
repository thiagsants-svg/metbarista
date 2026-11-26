"use client";

/**
 * The machine's scale, read live for pour-over (status events, ~10 a second).
 * Read only: no tare is sent, the page keeps its own zero.
 */

import { useEffect, useRef, useState } from "react";
import { connectSocket, disconnectSocket } from "./machine-socket";
import { readingsOf } from "./station/readings";
import type { Sample } from "./pour-over";

export function usePourScale(onSample: (s: Sample) => void) {
  const [weight, setWeight] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const cb = useRef(onSample);
  useEffect(() => { cb.current = onSample; }, [onSample]);

  useEffect(() => {
    let lastShown = 0;
    let lastT = 0;
    const handlers = {
      status: (s: Parameters<typeof readingsOf>[0]) => {
        const w = readingsOf(s).weight;
        if (w == null) return;
        // Several events can arrive in one poll: keep them apart in time, or the flow reads wrong
        const t = Math.max(performance.now() / 1000, lastT + 0.05);
        lastT = t;
        cb.current({ t, w });
        // The number on screen: 10 times a second is plenty
        if (t - lastShown >= 0.1) { lastShown = t; setWeight(w); }
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

  return { weight, connected };
}
