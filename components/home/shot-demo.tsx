"use client";

/**
 * The home page's picture of the Station: a real shot (lib/real-shot.ts)
 * played as the Station shows it, readouts with the cup beside the weight and
 * the pressure dial, the live chart and the stage console under it (which
 * exit ended each stage), in a tablet frame, on a loop. Four times real speed, a
 * pause on the finished shot, then again. It only plays while on screen, and
 * holds the finished shot when motion is reduced.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ShotPlot, COLORS } from "@/components/shot-charts";
import { EspressoGlass, CUP_ASPECT } from "@/components/station/espresso-glass";
import { Readout } from "@/components/station/readout";
import { PressureGauge } from "@/components/pressure-gauge";
import { ShotConsole } from "@/components/station/shot-console";
import { realShot, REAL_SHOT_PROFILE } from "@/lib/real-shot";
import { stageLog } from "@/lib/stage-log";

/** Played at four times the real speed */
const SPEED = 4;
/** The finished shot stays this long before it starts again */
const HOLD_MS = 5000;
const TARGET_G = 40;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const noop = () => {};

export function ShotDemo() {
  const points = useMemo(() => realShot(), []);
  const [i, setI] = useState(1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let visible = false;
    let at = 1;
    const delay = () => at >= points.length ? HOLD_MS : Math.max(40, (points[at].t - points[at - 1].t) / SPEED);
    const tick = () => {
      if (!visible) { timer = null; return; }
      at = at >= points.length ? 1 : at + 1;
      setI(at);
      timer = setTimeout(tick, delay());
    };
    if (reduce) {
      const show = setTimeout(() => setI(points.length), 0);
      return () => clearTimeout(show);
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !timer) timer = setTimeout(tick, delay());
    }, { threshold: 0.2 });
    if (boxRef.current) io.observe(boxRef.current);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [points]);

  const data = points.slice(0, i);
  const now = data[data.length - 1];
  const done = i >= points.length;
  // The last drops (retracting, no stage) come after the shot: the log reads it as finished
  const log = stageLog(data, REAL_SHOT_PROFILE, !done && now.stage != null);

  return (
    <div ref={boxRef} role="img"
      aria-label="The Station playing a real shot: pressure and flow curves, the cup filling to 40 g, and the stage console saying which condition ended each stage"
      className="rounded-[1.6rem] border-[10px] border-[#111] bg-[var(--paper)] p-3 shadow-2xl sm:p-4">
      {/* Phones: four numbers in a 2×2 grid; from tablet width the Station's row, with the cup and the dial */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,1.3fr)] sm:gap-3" aria-hidden>
        <Readout label="Time" value={clock(now.t / 1000)} unit="" color="var(--ink)" />
        {/* Weight with the cup filling beside it, as on the Station */}
        <div className="flex min-w-0 items-center justify-between gap-1 border-t-2 border-[var(--ink)] pt-1">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">Weight</p>
            <p className="whitespace-nowrap text-[clamp(1.3rem,3vmax,2.4rem)] font-extrabold tracking-tight tabular-nums leading-tight" style={{ color: COLORS.weight }}>
              {(now.weight ?? 0).toFixed(1)}
              <span className="ml-1 text-xs font-medium text-[var(--ink)]/65">/ {TARGET_G} g</span>
            </p>
          </div>
          <div className="relative hidden h-[72px] shrink-0 self-end overflow-hidden sm:block" style={{ aspectRatio: CUP_ASPECT }}>
            <EspressoGlass weight={now.weight} scale={now.weight} target={TARGET_G} flow={now.grav} brewing={!done} cupOnly />
          </div>
        </div>
        <Readout label="Flow" value={(now.flow ?? 0).toFixed(1)} unit="ml/s" color={COLORS.flow} />
        <div className="hidden sm:block"><PressureGauge value={now.pressure} color={COLORS.pressure} /></div>
        <div className="sm:hidden"><Readout label="Pressure" value={(now.pressure ?? 0).toFixed(1)} unit="bar" color={COLORS.pressure} /></div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--ink)]/70 sm:text-sm" aria-hidden>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.pressure }} />Pressure</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.flow }} />Flow</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.weight }} />Weight</span>
      </div>
      <div className="relative mt-1 aspect-[4/3] w-full sm:aspect-[16/8]" aria-hidden>
        <div className="absolute inset-0">
          <ShotPlot data={data} targetWeight={TARGET_G} currentStage={done ? null : now.stage} />
        </div>
      </div>
      <div className="mt-2" aria-hidden>
        <ShotConsole events={log.events} live={log.live} canSkip={false} skipBusy={false} onSkip={noop} />
      </div>
    </div>
  );
}
