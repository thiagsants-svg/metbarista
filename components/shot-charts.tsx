"use client";

/**
 * Live shot chart for the Station screen, in the style of the official
 * Meticulous app (filled areas, dark panel), condensed into one chart:
 *  - left axis (0–12): pressure (bar), flow (ml/s), cup flow (g/s), the same
 *    scale as the Meticulous's own charts
 *  - optional thin line: puck resistance (lib/resistance.ts), on the shot page
 *  - right axis: weight (g), with the recipe's target as a dashed line
 *  - no temperature line: it drops sharply during extraction (normal, but
 *    unhelpful), so like the official charts it is left out; heating
 *    progress has its own view instead
 *  - profile stages shaded behind the curves, current stage highlighted
 */

import { memo, useEffect, useState } from "react";
import { HeatBar } from "@/components/station/heat-bar";
import { TEMP_LABEL } from "@/lib/station/readings";
import { BAR_DOWN_MARGIN, barDownState, waterLeft } from "@/lib/heat-log";
import { resistanceOf } from "@/lib/resistance";
export { BAR_DOWN_MARGIN };
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from "recharts";

export interface ShotPoint {
  t: number;               // ms since extraction started
  pressure: number | null; // bar
  flow: number | null;     // ml/s (pump)
  grav: number | null;     // g/s (from the scale)
  weight: number | null;   // g
  temp: number | null;     // °C (tube)
  barUp?: number;
  barMidUp?: number;
  barMidDown?: number;
  barDown?: number;
  ext1?: number;
  ext2?: number;
  stage: string | null;    // profile stage name reported by the machine
  pTarget?: number | null; // pressure setpoint of the running stage (bar)
  fTarget?: number | null; // flow setpoint of the running stage (ml/s)
}

export const COLORS = {
  // Theme variables (set on the Station root): light Swiss or dark bumblebee
  pressure: "var(--accent)",
  flow: "var(--ink)",
  grav: "var(--grav)",
  weight: "var(--weight)",
  temp: "var(--temp)",
  stage: "var(--accent)",
};

const AXIS_TICK = { fontSize: 13, fill: "var(--ink)", fillOpacity: 0.7 };

interface StageSpan { name: string; x1: number; x2: number }

/** Consecutive runs of the same stage, as [start, end] in ms. */
function stageSpans(data: ShotPoint[]): StageSpan[] {
  const spans: StageSpan[] = [];
  for (const d of data) {
    if (!d.stage) continue;
    const last = spans[spans.length - 1];
    if (last && last.name === d.stage) last.x2 = d.t;
    else {
      if (last) last.x2 = d.t; // close the previous stage where this one starts
      spans.push({ name: d.stage, x1: d.t, x2: d.t });
    }
  }
  return spans;
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

function Gradient({ id, color, opacity = 0.14 }: { id: string; color: string; opacity?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={opacity} />
      <stop offset="100%" stopColor={color} stopOpacity={0.03} />
    </linearGradient>
  );
}

export function ShotCharts({
  data, live, targetWeight, placeholder, currentStage, showTemps = false, footer, glass, headerRight,
}: {
  /** At the right end of the legend row (e.g. the console switch) */
  headerRight?: React.ReactNode;
  /** Shown under the chart while there is shot data (e.g. the running stage) */
  footer?: React.ReactNode;
  /** Drawn inside the plot while there is shot data, behind the curves (the filling glass) */
  glass?: React.ReactNode;
  data: ShotPoint[];
  live: Partial<ShotPoint>;
  targetWeight: number | null;
  placeholder: React.ReactNode;
  currentStage: string | null;
  /** Also plot every temperature sensor (for studying how they move during the shot) */
  showTemps?: boolean;
}) {
  const header = [
    { label: "Pressure", value: fmt(live.pressure), unit: "bar", color: COLORS.pressure },
    { label: "Flow", value: fmt(live.flow), unit: "ml/s", color: COLORS.flow },
    { label: "In cup", value: fmt(live.grav), unit: "g/s", color: COLORS.grav },
    // Weight and temperature have their own big readouts above the chart
    { label: "Weight", value: "", unit: "", color: COLORS.weight },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t-2 border-[var(--ink)] pt-2">
      <div className={`${data.length ? "flex" : "hidden"} shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-1 pb-1`}>
        {header.map((i) => (
          <span key={i.label} className="inline-flex items-baseline gap-1.5">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: i.color }} />
            <span className="text-sm font-medium text-[var(--ink)]/60">{i.label}</span>

          </span>
        ))}
        {headerRight && <span className="ml-auto self-center">{headerRight}</span>}
      </div>
      {showTemps && data.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 px-1 pb-1">
          {HEAT_SENSORS.map((s) => {
            const v = data[data.length - 1][s.key as keyof ShotPoint];
            return (
              <span key={s.key} className="inline-flex items-baseline gap-1 text-xs">
                <span className={`${s.key === "temp" ? "h-1" : "h-0.5"} w-3 self-center rounded-full`} style={{ backgroundColor: s.color }} />
                <span className="text-[var(--ink)]/70">{s.label}</span>
                <span className="font-mono font-bold" style={{ color: s.color }}>
                  {typeof v === "number" ? v.toFixed(1) : "—"}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--ink)]/35">
            {placeholder}
          </div>
        ) : (
          <div className="absolute inset-0">
            {glass && (
              // The plot itself, inside the axes (left 28, right 36 + 4, top 22, time axis 30)
              <div className="pointer-events-none absolute bottom-[30px] left-[28px] right-[40px] top-[22px]">
                {/* Stands on the time axis. Golden section both ways: as tall as 0.618 of the
                    plot, centered on the line that splits the right 0.618 of its width
                    (0.382 + 0.618 x 0.618 = 0.764), so it sits off the edge, not on it.
                    Faded, so the curves read in front of it. */}
                <div className="absolute bottom-0 left-[76.4%] aspect-[160/354] h-[61.8%] max-w-[34%] -translate-x-1/2 opacity-60">{glass}</div>
              </div>
            )}
            {/* Over the glass, the curves get a thin outline in the background color, to stay readable */}
            <div className={`absolute inset-0 ${glass ? "[&_.recharts-curve]:[filter:drop-shadow(0_0_1px_var(--paper))_drop-shadow(0_0_1px_var(--paper))]" : ""}`}>
              {showTemps ? (
                // Two charts, same time axis: the shot on top, temperatures below
                <div className="absolute inset-0 flex flex-col gap-2">
                  <div className="relative min-h-0 flex-[3]">
                    <ShotPlot data={data} targetWeight={targetWeight} currentStage={currentStage} />
                  </div>
                  <div className="relative min-h-0 flex-[2] border-t border-[var(--ink)]/20 pt-1">
                    <TempPlot data={data} currentStage={currentStage} />
                  </div>
                </div>
              ) : (
                <ShotPlot data={data} targetWeight={targetWeight} currentStage={currentStage} />
              )}
            </div>
          </div>
        )}
      </div>
      {footer && <div className="mt-2 shrink-0">{footer}</div>}
    </div>
  );
}

/**
 * The shot chart itself. Memoized: it only redraws when the data array (or
 * target/stage) changes, not on every live reading — old tablets struggle to
 * redraw a few hundred points several times a second. Straight segments
 * (`linear`) are cheaper than smoothed curves and look the same at ~10 Hz.
 */
export const ShotPlot = memo(function ShotPlot({
  data: raw, targetWeight, currentStage, marks = [], resistance = false,
}: {
  /** Draw the puck resistance (thin line, its own hidden scale) */
  resistance?: boolean;
  data: ShotPoint[];
  targetWeight: number | null;
  currentStage: string | null;
  /** Moments to point out (shot facts), as a dashed vertical line */
  marks?: { t: number; label: string }[];
}) {
  const data = resistance ? withRes(raw) : raw;
  const maxWeight = Math.max(targetWeight ?? 0, ...data.map((d) => d.weight ?? 0));
  const resVals = resistance ? data.map((d) => (d as ShotPoint & { res?: number | null }).res).filter((v): v is number => typeof v === "number").sort((a, b) => a - b) : [];
  const resTop = resVals.length ? resVals[Math.floor(resVals.length * 0.95)] * 1.2 : 1;
  const weightTop = Math.max(10, Math.ceil((maxWeight * 1.15) / 10) * 10);
  const spans = stageSpans(data);
  const totalT = data.length ? data[data.length - 1].t : 1;

  return (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <Gradient id="g-pressure" color={COLORS.pressure} />
                <Gradient id="g-flow" color={COLORS.flow} />
                <Gradient id="g-weight" color={COLORS.weight} opacity={0.08} />
              </defs>
              <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeDasharray="2 4" />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]}
                tickFormatter={(v) => `${Math.round(v / 1000)}s`}
                tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" domain={[0, 12]} ticks={[0, 2, 4, 6, 8, 10, 12]} width={28}
                tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" hide domain={[0, resTop]} allowDataOverflow />
              <YAxis yAxisId="w" orientation="right" domain={[0, weightTop]} width={36}
                tick={{ ...AXIS_TICK, fill: COLORS.weight }} tickLine={false} axisLine={false} unit="g" />


              {/* Profile stages, behind everything */}
              {spans.map((sp, i) => {
                const isCurrent = currentStage != null && i === spans.length - 1 && sp.name === currentStage;
                // Very short stages get no label, so names don't overlap
                const showLabel = isCurrent || (sp.x2 - sp.x1) / totalT >= 0.08;
                return (
                  <ReferenceArea
                    key={`${sp.name}-${sp.x1}`}
                    yAxisId="l"
                    x1={sp.x1}
                    x2={Math.max(sp.x2, sp.x1 + 1)}
                    ifOverflow="hidden"
                    fill={isCurrent ? COLORS.stage : "var(--ink)"}
                    fillOpacity={isCurrent ? 0.06 : i % 2 === 0 ? 0.02 : 0.045}
                    stroke={isCurrent ? COLORS.stage : "none"}
                    strokeOpacity={0.4}
                    label={!showLabel ? undefined : {
                      value: sp.name,
                      position: "insideTopLeft",
                      offset: 4,
                      fill: isCurrent ? COLORS.stage : "var(--ink)",
                      fillOpacity: isCurrent ? 1 : 0.45,
                      fontSize: 12,
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                  />
                );
              })}

              {targetWeight != null && (
                <ReferenceLine yAxisId="w" y={targetWeight} stroke={COLORS.weight} strokeOpacity={0.6} strokeDasharray="6 4" />
              )}
              <Area yAxisId="w" type="linear" dataKey="weight" stroke={COLORS.weight} strokeWidth={2.5} fill="url(#g-weight)" dot={false} isAnimationActive={false} connectNulls />
              <Area yAxisId="l" type="linear" dataKey="pressure" stroke={COLORS.pressure} strokeWidth={2.5} fill="url(#g-pressure)" dot={false} isAnimationActive={false} connectNulls />
              <Area yAxisId="l" type="linear" dataKey="flow" stroke={COLORS.flow} strokeWidth={2.5} fill="url(#g-flow)" dot={false} isAnimationActive={false} connectNulls />
              {/* Stage targets, dotted like the machine's sensor page */}
              <Line yAxisId="l" type="stepAfter" dataKey="pTarget" stroke={COLORS.pressure} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="stepAfter" dataKey="fTarget" stroke={COLORS.flow} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="linear" dataKey="grav" stroke={COLORS.grav} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
              {resistance && (
                <Line yAxisId="r" type="linear" dataKey="res" stroke="var(--h4)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              )}
              {marks.map((m) => (
                <ReferenceLine key={`${m.label}-${m.t}`} yAxisId="l" x={m.t} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: m.label, position: "insideBottomLeft", fill: "var(--accent)", fontSize: 12, fontWeight: 700 }} />
              ))}

            </ComposedChart>
          </ResponsiveContainer>
  );
});

/** The points with their puck resistance, as `res` */
function withRes(data: ShotPoint[]): (ShotPoint & { res: number | null })[] {
  const r = resistanceOf(data);
  return data.map((d, i) => ({ ...d, res: r[i] }));
}

/**
 * Temperature sensors during the shot, under the shot chart: same time axis,
 * same stage bands (no labels), every sensor with the tube thick, scale fitted
 * to the readings (at least 6 °C tall).
 */
const TempPlot = memo(function TempPlot({ data, currentStage }: { data: ShotPoint[]; currentStage: string | null }) {
  const values = data.flatMap((d) => HEAT_SENSORS.map((s) => d[s.key as keyof ShotPoint]))
    .filter((v): v is number => typeof v === "number");
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 100;
  const pad = Math.max(1, (6 - (hi - lo)) / 2);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const spans = stageSpans(data);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeDasharray="2 4" />
        <XAxis dataKey="t" type="number" domain={[0, "dataMax"]}
          tickFormatter={(v) => `${Math.round(v / 1000)}s`}
          tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis domain={[lo, hi]} allowDecimals={false} width={28} unit="°"
          tick={{ ...AXIS_TICK, fill: COLORS.temp }} tickLine={false} axisLine={false} />
        {spans.map((sp, i) => {
          const isCurrent = currentStage != null && i === spans.length - 1 && sp.name === currentStage;
          return (
            <ReferenceArea key={`${sp.name}-${sp.x1}`} x1={sp.x1} x2={Math.max(sp.x2, sp.x1 + 1)} ifOverflow="hidden"
              fill={isCurrent ? COLORS.stage : "var(--ink)"}
              fillOpacity={isCurrent ? 0.1 : i % 2 === 0 ? 0.03 : 0.07} />
          );
        })}
        {HEAT_SENSORS.filter((s) => s.key !== "temp").map((s) => (
          <Line key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={1.25} strokeOpacity={0.85}
            dot={false} activeDot={false} isAnimationActive={false} connectNulls />
        ))}
        <Line type="linear" dataKey="temp" stroke={HEAT_SENSORS[0].color} strokeWidth={3}
          dot={false} activeDot={false} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

export interface HeatPoint {
  t: number;      // s since heating started
  temp: number;   // status temperature (the tube), what the dial shows
  barUp?: number;
  barMidUp?: number;
  barMidDown?: number;
  barDown?: number;
  ext1?: number;
  ext2?: number;
}

/** Group sensors, named like the machine's own Sensors page. */
export const HEAT_SENSORS: { key: keyof HeatPoint; label: string; color: string }[] = [
  { key: "temp", label: TEMP_LABEL, color: "var(--h0)" },
  { key: "barUp", label: "Bar up", color: "var(--h1)" },
  { key: "barMidUp", label: "Bar mid-up", color: "var(--h2)" },
  { key: "barMidDown", label: "Bar mid-down", color: "var(--h3)" },
  { key: "barDown", label: "Bar down", color: "var(--h4)" },
  { key: "ext1", label: "External 1", color: "var(--h5)" },
  { key: "ext2", label: "External 2", color: "var(--h6)" },
];

/**
 * Heating progress: current temperature and every group temperature sensor
 * climbing toward the target line.
 */
export const HeatingProgress = memo(function HeatingProgress({
  samples, target, current, title = "Heating", titleColor = "var(--heat)", hint = "Prep the puck and cup", clock = false,
}: {
  samples: HeatPoint[];
  target: number | null;
  current: number | null;
  title?: string;
  titleColor?: string;
  hint?: string;
  /** x is epoch seconds: show a rolling window labelled with the time of day */
  clock?: boolean;
}) {
  /** Every group sensor on the chart (the default), or just the water and the Bar down (kept on this tablet) */
  const [allSensors, setAllSensors] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the tablet's choice once, after the page loads
    setAllSensors(localStorage.getItem("metbarista_all_sensors") !== "off");
  }, []);
  const present = HEAT_SENSORS.filter((s) => samples.some((p) => typeof p[s.key] === "number"));
  // The water and the Bar down (closest to the puck, often the last to arrive) decide; the rest on demand
  const shown = allSensors ? present : present.filter((s) => s.key === "temp" || s.key === "barDown");
  const others = shown.filter((s) => s.key !== "temp");
  const waterSecs = waterLeft(samples, target, current);
  const waterReady = waterSecs === 0;
  const bd = barDownState(samples, target);
  const bdGoal = target != null ? target - BAR_DOWN_MARGIN : null;
  const minutes = (sec: number) => (sec < 60 ? "under a minute" : `about ${Math.round(sec / 60)} min`);
  const first = samples[0];
  const values = samples.flatMap((p) => shown.map((s) => p[s.key] as number | undefined))
    .filter((v): v is number => typeof v === "number");
  const lo = Math.floor(Math.min(...values, current ?? Infinity) - 2);
  const hi = Math.ceil(Math.max(...values, target ?? 0, current ?? 0) + 2);

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <p className="text-sm font-medium uppercase tracking-wider" style={{ color: titleColor }}>{title}</p>
      {/* Water and group on their way, how long is left from how fast each has been climbing */}
      {target != null ? (
        <div className="flex flex-col gap-2">
          <HeatBar label="Water" value={current} start={typeof first?.temp === "number" ? first.temp : null} goal={target}
            ready={waterReady} note={waterReady ? "ready" : waterSecs != null ? minutes(waterSecs) : null} />
          {bd && bdGoal != null && (
            <HeatBar label="Bar down" value={bd.barDown} start={typeof first?.barDown === "number" ? first.barDown : null} goal={bdGoal}
              ready={bd.kind === "ready" || bd.kind === "settled"}
              note={bd.kind === "ready" ? "ready" : bd.kind === "settled" ? "settled: ready" : bd.kind === "flat" ? "not climbing yet" : minutes(bd.left)} />
          )}
        </div>
      ) : (
        <p className="text-6xl font-extrabold tracking-tighter text-[var(--ink)]">{current != null ? current.toFixed(1) : "—"}<span className="ml-2 text-2xl text-[var(--ink)]/65">°C</span></p>
      )}
      {/* Legend, and the switch for the other group sensors */}
      {present.length > 1 && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[var(--ink)]/60">{s.label}</span>
          </span>
        ))}
        <label className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--ink)]/70">
          <input type="checkbox" className="h-5 w-5" checked={allSensors}
            onChange={(e) => {
              setAllSensors(e.target.checked);
              try { localStorage.setItem("metbarista_all_sensors", e.target.checked ? "on" : "off"); } catch { /* storage blocked */ }
            }} />
          All sensors
        </label>
      </div>}
      <div className="relative min-h-0 flex-1">
        {samples.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={samples} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs><Gradient id="g-heat" color="var(--heat)" opacity={0.3} /></defs>
              <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeDasharray="2 4" />
              <XAxis dataKey="t" type="number" domain={clock ? ["dataMin", "dataMax"] : [0, "dataMax"]}
                tickFormatter={(v) => clock
                  ? new Date(v * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : `${Math.round(v)}s`}
                tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={[lo, hi]} width={34} tick={AXIS_TICK} tickLine={false} axisLine={false} unit="°" />
              {target != null && (
                <ReferenceLine y={target} stroke="var(--ink)" strokeDasharray="6 4" strokeOpacity={0.8}
                  label={{ value: `${target} °C`, position: "insideTopRight", fill: "var(--ink)", fontSize: 12 }} />
              )}
              {others.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.key === "barDown" ? 2.5 : 1.5}
                  strokeOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
              ))}
              <Area type="monotone" dataKey="temp" stroke="var(--heat)" strokeWidth={3} fill="url(#g-heat)"
                baseValue={lo} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {hint && <p className="text-center text-base text-[var(--ink)]/65">{hint}</p>}
    </div>
  );
});

/**
 * "About 2 min to 94 °C", from how fast the tube climbed over the last ~30 s.
 * Null until it has climbed for a while, or when it isn't climbing.
 */
export function heatEta(samples: HeatPoint[], target: number | null, current: number | null): string | null {
  const left = waterLeft(samples, target, current);
  if (left == null) return null;
  if (left === 0) return "Water at temperature";
  return left < 60 ? `Water: under a minute to ${target} °C` : `Water: about ${Math.round(left / 60)} min to ${target} °C`;
}

/**
 * "Bar down: about 3 min to 90 °C": when the Bar down sensor (the group's
 * lowest, by the puck) gets within BAR_DOWN_MARGIN of the target (see
 * lib/heat-log.ts, which also logs these forecasts against the real arrival).
 */
export function barDownReady(samples: HeatPoint[], target: number | null, margin = BAR_DOWN_MARGIN): string | null {
  const s = barDownState(samples, target, margin);
  if (!s || target == null) return null;
  const goal = target - margin;
  if (s.kind === "ready") return `Ready: group within ${margin} °C (Bar down ${s.barDown.toFixed(1)})`;
  if (s.kind === "flat") return `Group (Bar down) ${s.barDown.toFixed(1)} °C, not climbing yet`;
  if (s.kind === "settled") return `Ready: group settled (Bar down ${s.barDown.toFixed(1)} °C, ${(target - s.barDown).toFixed(1)} below)`;
  return s.left < 60 ? `Group (Bar down): under a minute to ${goal} °C` : `Group (Bar down): about ${Math.round(s.left / 60)} min to ${goal} °C`;
}

