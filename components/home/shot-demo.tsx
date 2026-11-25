"use client";

/**
 * The home page's picture of the Station: the live chart playing the demo
 * shot (the same one as /station/?demo=pour), in a tablet frame, on a loop.
 * Twice real speed, a pause on the finished shot, then again. It only plays
 * while on screen, and holds the finished shot when motion is reduced.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ShotPlot, COLORS } from "@/components/shot-charts";
import { EspressoGlass } from "@/components/station/espresso-glass";
import { Readout } from "@/components/station/readout";
import { demoShot } from "@/lib/demo-shot";

/** ms per point: the demo has a point every 200 ms, played at twice the speed */
const STEP_MS = 100;
/** The finished shot stays this long before it starts again */
const HOLD_MS = 4000;
const TARGET_G = 40;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ShotDemo() {
  const points = useMemo(() => demoShot(), []);
  const [i, setI] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let visible = false;
    let at = 1;
    const tick = () => {
      if (!visible) { timer = null; return; }
      const end = at >= points.length;
      at = end ? 1 : at + 1;
      setI(at);
      timer = setTimeout(tick, at >= points.length ? HOLD_MS : STEP_MS);
    };
    if (reduce) {
      const show = setTimeout(() => setI(points.length), 0);
      return () => clearTimeout(show);
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !timer) timer = setTimeout(tick, STEP_MS);
    }, { threshold: 0.2 });
    if (boxRef.current) io.observe(boxRef.current);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [points]);

  const data = points.slice(0, i);
  const now = data[data.length - 1];
  const done = i >= points.length;

  return (
    <div ref={boxRef} role="img"
      aria-label="The Station's live chart playing a shot: pressure and flow curves, the cup filling to 40 g"
      className="rounded-[1.6rem] border-[10px] border-[#111] bg-[var(--paper)] p-3 shadow-2xl sm:p-4">
      <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden>
        <Readout label="Time" value={clock(now.t / 1000)} unit="" color="var(--ink)" />
        <Readout label="Weight" value={(now.weight ?? 0).toFixed(1)} unit={`/ ${TARGET_G} g`} color={COLORS.weight} />
        <Readout label="Flow" value={(now.flow ?? 0).toFixed(1)} unit="ml/s" color={COLORS.flow} />
        <Readout label="Pressure" value={(now.pressure ?? 0).toFixed(1)} unit="bar" color={COLORS.pressure} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs sm:text-sm" aria-hidden>
        <span className="flex gap-3 text-[var(--ink)]/70">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.pressure }} />Pressure</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.flow }} />Flow</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.weight }} />Weight</span>
        </span>
        <span className="rounded-full bg-[var(--primary)]/25 px-2.5 py-0.5 font-semibold text-[var(--accent)]">
          {done ? "Shot done" : now.stage}
        </span>
      </div>
      <div className="relative mt-1 aspect-[16/9] w-full" aria-hidden>
        {/* The cup, faded behind the curves, where the Station puts it */}
        <div className="pointer-events-none absolute bottom-[30px] left-[28px] right-[40px] top-[22px]">
          <div className="absolute bottom-0 left-[76.4%] aspect-[160/354] h-[61.8%] max-w-[34%] -translate-x-1/2 opacity-60">
            <EspressoGlass weight={now.weight} scale={now.weight} target={TARGET_G} flow={now.grav} brewing={!done} />
          </div>
        </div>
        <div className="absolute inset-0 [&_.recharts-curve]:[filter:drop-shadow(0_0_1px_var(--paper))_drop-shadow(0_0_1px_var(--paper))]">
          <ShotPlot data={data} targetWeight={TARGET_G} currentStage={done ? null : now.stage} />
        </div>
      </div>
    </div>
  );
}
