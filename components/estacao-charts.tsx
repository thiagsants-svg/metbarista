"use client";

/**
 * Live shot chart for the Station screen, in the style of the official
 * Meticulous app (filled areas, dark panel), condensed into one chart:
 *  - left axis (0–12): pressure (bar), flow (ml/s), gravimetric flow (g/s)
 *  - right axis: weight (g), with the recipe's target as a dashed line
 *  - no temperature line: it drops sharply during extraction (normal, but
 *    unhelpful), so like the official charts it is left out; heating
 *    progress has its own view instead
 *  - profile stages shaded behind the curves, current stage highlighted
 */

import { memo, useState } from "react";
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

const AXIS_TICK = { fontSize: 13, fill: "var(--ink)", fillOpacity: 0.4 };

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
  data, live, targetWeight, placeholder, currentStage, showTemps = false, onToggleTemps, footer,
}: {
  /** Shown under the chart while there is shot data (e.g. the running stage) */
  footer?: React.ReactNode;
  data: ShotPoint[];
  live: Partial<ShotPoint>;
  targetWeight: number | null;
  placeholder: React.ReactNode;
  currentStage: string | null;
  /** Also plot every temperature sensor (for studying how they move during the shot) */
  showTemps?: boolean;
  onToggleTemps?: () => void;
}) {
  const header = [
    { label: "Pressure", value: fmt(live.pressure), unit: "bar", color: COLORS.pressure },
    { label: "Flow", value: fmt(live.flow), unit: "ml/s", color: COLORS.flow },
    { label: "Grav", value: fmt(live.grav), unit: "g/s", color: COLORS.grav },
    // Weight and temperature have their own big readouts above the chart
    { label: "Weight", value: "", unit: "", color: COLORS.weight },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t-2 border-[var(--ink)] pt-2">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-1 pb-1">
        {header.map((i) => (
          <span key={i.label} className="inline-flex items-baseline gap-1.5">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: i.color }} />
            <span className="text-sm font-medium text-[var(--ink)]/60">{i.label}</span>
            <span className="font-mono text-lg font-bold" style={{ color: i.color }}>{i.value}</span>
            <span className="text-xs text-[var(--ink)]/40">{i.unit}</span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {currentStage && (
            <span className="rounded-full bg-[var(--ink)]/[0.06] px-3 py-1 text-sm font-semibold text-[var(--accent)]">
              {currentStage}
            </span>
          )}
          {onToggleTemps && data.length > 0 && (
            <button onClick={onToggleTemps} aria-pressed={showTemps} title="Show temperature sensors"
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                showTemps ? "border-[#f43f5e]/60 bg-[#f43f5e]/15 text-[#f43f5e]" : "border-[var(--ink)]/20 text-[var(--ink)]/40"
              }`}>
              Temps
            </button>
          )}
        </span>
      </div>
      {showTemps && data.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 px-1 pb-1">
          {HEAT_SENSORS.map((s) => {
            const v = data[data.length - 1][s.key as keyof ShotPoint];
            return (
              <span key={s.key} className="inline-flex items-baseline gap-1 text-xs">
                <span className={`${s.key === "temp" ? "h-1" : "h-0.5"} w-3 self-center rounded-full`} style={{ backgroundColor: s.color }} />
                <span className="text-[var(--ink)]/55">{s.label}</span>
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
          showTemps ? (
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
          )
        )}
      </div>
      {data.length > 0 && footer && <div className="mt-2 shrink-0">{footer}</div>}
    </div>
  );
}

/**
 * The shot chart itself. Memoized: it only redraws when the data array (or
 * target/stage) changes, not on every live reading — old tablets struggle to
 * redraw a few hundred points several times a second. Straight segments
 * (`linear`) are cheaper than smoothed curves and look the same at ~10 Hz.
 */
const ShotPlot = memo(function ShotPlot({
  data, targetWeight, currentStage,
}: {
  data: ShotPoint[];
  targetWeight: number | null;
  currentStage: string | null;
}) {
  const maxWeight = Math.max(targetWeight ?? 0, ...data.map((d) => d.weight ?? 0));
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

            </ComposedChart>
          </ResponsiveContainer>
  );
});

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
  { key: "temp", label: "Tube", color: "var(--h0)" },
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
  const last = samples[samples.length - 1];
  const shown = HEAT_SENSORS.filter((s) => samples.some((p) => typeof p[s.key] === "number"));
  const values = samples.flatMap((p) => shown.map((s) => p[s.key] as number | undefined))
    .filter((v): v is number => typeof v === "number");
  const lo = Math.floor(Math.min(...values, current ?? Infinity) - 2);
  const hi = Math.ceil(Math.max(...values, target ?? 0, current ?? 0) + 2);

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider" style={{ color: titleColor }}>{title}</p>
          <p className="text-6xl font-extrabold tracking-tighter text-[var(--ink)]">
            {current != null ? current.toFixed(1) : "—"}
            <span className="ml-2 text-2xl text-[var(--ink)]/40">{target != null ? `→ ${target} °C` : "°C"}</span>
          </p>
        </div>
      </div>
      {/* Legend with each sensor's current value */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[var(--ink)]/60">{s.label}</span>
            <span className="font-mono font-bold" style={{ color: s.color }}>
              {typeof last?.[s.key] === "number" ? (last[s.key] as number).toFixed(1) : "—"}
            </span>
          </span>
        ))}
      </div>
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
              {shown.filter((s) => s.key !== "temp").map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5}
                  strokeOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
              ))}
              <Area type="monotone" dataKey="temp" stroke="var(--heat)" strokeWidth={3} fill="url(#g-heat)"
                baseValue={lo} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {hint && <p className="text-center text-base text-[var(--ink)]/45">{hint}</p>}
    </div>
  );
});

/**
 * Moving average over the last `windowS` seconds for every sensor, then
 * thinned to about `maxPoints` points. Sensor noise is a few tenths of a
 * degree; averaging keeps the trend and drops the jitter.
 */
function smoothSamples(samples: HeatPoint[], windowS: number, maxPoints: number): HeatPoint[] {
  if (samples.length < 3) return samples;
  const keys = HEAT_SENSORS.map((s) => s.key).filter((k) => k !== "t") as (keyof HeatPoint)[];
  const out: HeatPoint[] = [];
  const step = Math.max(1, Math.floor(samples.length / maxPoints));
  let start = 0;
  for (let i = 0; i < samples.length; i++) {
    while (samples[i].t - samples[start].t > windowS) start++;
    if (i % step !== 0 && i !== samples.length - 1) continue;
    const point: HeatPoint = { t: samples[i].t, temp: 0 };
    for (const k of keys) {
      let sum = 0, n = 0;
      for (let j = start; j <= i; j++) {
        const v = samples[j][k];
        if (typeof v === "number") { sum += v; n++; }
      }
      if (n) (point as unknown as Record<string, number>)[k] = sum / n;
    }
    out.push(point);
  }
  return out;
}

const WINDOWS = [
  { label: "30 s", s: 30 },
  { label: "1 min", s: 60 },
  { label: "5 min", s: 300 },
  { label: "10 min", s: 600 },
  { label: "15 min", s: 900 },
];

/**
 * Idle view: rolling chart of every thermometer. Scale fits the data so small
 * changes show; the main temperature (tube, what the dial shows) is a thick
 * line, the other sensors thin; time window buttons (10 min by default).
 * `samples[].t` is epoch seconds.
 */
export const GroupTemperatures = memo(function GroupTemperatures({ samples, target }: { samples: HeatPoint[]; target: number | null }) {
  const [windowS, setWindowS] = useState(600);
  const now = samples.length ? samples[samples.length - 1].t : 0;
  const raw = samples.filter((p) => now - p.t <= windowS);
  // Average over ~1/40 of the window (3 s at 30 s ... 15 s at 10 min), ~240 points max
  const shown = smoothSamples(raw, Math.min(20, Math.max(3, windowS / 40)), 240);
  const last = samples[samples.length - 1];
  const sensors = HEAT_SENSORS.filter((s) => shown.some((p) => typeof p[s.key] === "number"));
  const values = shown.flatMap((p) => sensors.map((s) => p[s.key] as number | undefined))
    .filter((v): v is number => typeof v === "number");
  // Fit the data, but never zoom in to less than 6 °C, so tenths don't look like spikes
  let lo = values.length ? Math.min(...values, target ?? Infinity) : 0;
  let hi = values.length ? Math.max(...values, target ?? -Infinity) : 100;
  const pad = Math.max(1, (6 - (hi - lo)) / 2);
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  // Seconds on the axis whenever the visible span is short (also right after opening the page)
  const span = shown.length ? shown[shown.length - 1].t - shown[0].t : 0;
  const withSeconds = span <= 300;

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-[var(--ink)]/50">Temperatures</p>
          <p className="text-6xl font-extrabold tracking-tighter text-[var(--ink)]">
            {typeof last?.temp === "number" ? last.temp.toFixed(1) : "—"}
            <span className="ml-2 text-2xl text-[var(--ink)]/40">°C</span>
          </p>
        </div>
        <div className="flex rounded-lg bg-[var(--ink)]/[0.05] p-0.5">
          {WINDOWS.map((w) => (
            <button key={w.s} onClick={() => setWindowS(w.s)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                windowS === w.s ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--ink)]/60"
              }`}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sensors.map((s) => (
          <span key={s.key} className="inline-flex items-baseline gap-1.5 text-sm">
            <span className={`${s.key === "temp" ? "h-1" : "h-0.5"} w-3.5 self-center rounded-full`} style={{ backgroundColor: s.color }} />
            <span className="text-[var(--ink)]/60">{s.label}</span>
            <span className="font-mono font-bold" style={{ color: s.color }}>
              {typeof last?.[s.key] === "number" ? (last[s.key] as number).toFixed(1) : "—"}
            </span>
          </span>
        ))}
        {target != null && (
          <span className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="w-3.5 self-center border-t-2 border-dotted border-[var(--ink)]" />
            <span className="text-[var(--ink)]/60">Target</span>
            <span className="font-mono font-bold text-[var(--accent)]">{target}</span>
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {shown.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeDasharray="2 4" />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => new Date(v * 1000).toLocaleTimeString([], withSeconds
                  ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                  : { hour: "2-digit", minute: "2-digit" })}
                tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={50} />
              <YAxis domain={[lo, hi]} allowDecimals={false} width={34} unit="°"
                tick={AXIS_TICK} tickLine={false} axisLine={false} />
              {target != null && (
                <ReferenceLine y={target} stroke="var(--ink)" strokeOpacity={0.8} strokeDasharray="2 4" />
              )}
              {sensors.filter((s) => s.key !== "temp").map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5}
                  strokeOpacity={0.85} dot={false} activeDot={false} isAnimationActive={false} connectNulls />
              ))}
              {/* Main temperature on top, thick */}
              <Line type="monotone" dataKey="temp" stroke={HEAT_SENSORS[0].color} strokeWidth={4}
                dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
