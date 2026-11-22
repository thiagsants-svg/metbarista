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

import { useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from "recharts";

export interface ShotPoint {
  t: number;               // ms since extraction started
  pressure: number | null; // bar
  flow: number | null;     // ml/s (pump)
  grav: number | null;     // g/s (from the scale)
  weight: number | null;   // g
  temp: number | null;     // °C
  stage: string | null;    // profile stage name reported by the machine
  pTarget?: number | null; // pressure setpoint of the running stage (bar)
  fTarget?: number | null; // flow setpoint of the running stage (ml/s)
}

export const COLORS = {
  // Bumblebee: yellow and black chrome; data colors kept distinct
  pressure: "#ffc400",
  flow: "#f5f5f5",
  grav: "#ff8a00",
  weight: "#38bdf8",
  temp: "#f43f5e",
  stage: "#ffc400",
};

const AXIS_TICK = { fontSize: 13, fill: "#fafafa", fillOpacity: 0.4 };

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

function Gradient({ id, color, opacity = 0.4 }: { id: string; color: string; opacity?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={opacity} />
      <stop offset="100%" stopColor={color} stopOpacity={0.03} />
    </linearGradient>
  );
}

export function ShotCharts({
  data, live, targetWeight, placeholder, currentStage,
}: {
  data: ShotPoint[];
  live: Partial<ShotPoint>;
  targetWeight: number | null;
  placeholder: React.ReactNode;
  currentStage: string | null;
}) {
  const maxWeight = Math.max(targetWeight ?? 0, ...data.map((d) => d.weight ?? 0));
  const weightTop = Math.max(10, Math.ceil((maxWeight * 1.15) / 10) * 10);
  const spans = stageSpans(data);
  const totalT = data.length ? data[data.length - 1].t : 1;

  const header = [
    { label: "Pressure", value: fmt(live.pressure), unit: "bar", color: COLORS.pressure },
    { label: "Flow", value: fmt(live.flow), unit: "ml/s", color: COLORS.flow },
    { label: "Grav", value: fmt(live.grav), unit: "g/s", color: COLORS.grav },
    // Weight and temperature have their own big readouts above the chart
    { label: "Weight", value: "", unit: "", color: COLORS.weight },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/[0.06] bg-[#141414] p-3">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-1 pb-1">
        {header.map((i) => (
          <span key={i.label} className="inline-flex items-baseline gap-1.5">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: i.color }} />
            <span className="text-sm font-medium text-[#fafafa]/60">{i.label}</span>
            <span className="font-mono text-lg font-bold" style={{ color: i.color }}>{i.value}</span>
            <span className="text-xs text-[#fafafa]/40">{i.unit}</span>
          </span>
        ))}
        {currentStage && (
          <span className="ml-auto rounded-full bg-[#ffc400]/15 px-3 py-1 text-sm font-semibold text-[#ffc400]">
            {currentStage}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {data.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#fafafa]/35">
            {placeholder}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <Gradient id="g-pressure" color={COLORS.pressure} />
                <Gradient id="g-flow" color={COLORS.flow} />
                <Gradient id="g-weight" color={COLORS.weight} opacity={0.25} />
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
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
                    fill={isCurrent ? COLORS.stage : "#ffffff"}
                    fillOpacity={isCurrent ? 0.13 : i % 2 === 0 ? 0.03 : 0.07}
                    stroke={isCurrent ? COLORS.stage : "none"}
                    strokeOpacity={0.4}
                    label={!showLabel ? undefined : {
                      value: sp.name,
                      position: "insideTopLeft",
                      offset: 4,
                      fill: isCurrent ? COLORS.stage : "#fafafa",
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
              <Area yAxisId="w" type="monotone" dataKey="weight" stroke={COLORS.weight} strokeWidth={2.5} fill="url(#g-weight)" dot={false} isAnimationActive={false} connectNulls />
              <Area yAxisId="l" type="monotone" dataKey="pressure" stroke={COLORS.pressure} strokeWidth={2.5} fill="url(#g-pressure)" dot={false} isAnimationActive={false} connectNulls />
              <Area yAxisId="l" type="monotone" dataKey="flow" stroke={COLORS.flow} strokeWidth={2.5} fill="url(#g-flow)" dot={false} isAnimationActive={false} connectNulls />
              {/* Stage targets, dotted like the machine's sensor page */}
              <Line yAxisId="l" type="stepAfter" dataKey="pTarget" stroke={COLORS.pressure} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="stepAfter" dataKey="fTarget" stroke={COLORS.flow} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="l" type="monotone" dataKey="grav" stroke={COLORS.grav} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** One heating sample: the main (tube) temperature plus every group sensor. */
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
  { key: "temp", label: "Tube", color: "#ff8a00" },
  { key: "barUp", label: "Bar up", color: "#ffe066" },
  { key: "barMidUp", label: "Bar mid-up", color: "#ffc400" },
  { key: "barMidDown", label: "Bar mid-down", color: "#f43f5e" },
  { key: "barDown", label: "Bar down", color: "#c084fc" },
  { key: "ext1", label: "External 1", color: "#38bdf8" },
  { key: "ext2", label: "External 2", color: "#2dd4bf" },
];

/**
 * Heating progress: current temperature and every group temperature sensor
 * climbing toward the target line.
 */
export function HeatingProgress({
  samples, target, current, title = "Heating", titleColor = "#ff8a00", hint = "Prep the puck and cup", clock = false,
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
          <p className="font-mono text-5xl font-bold text-[#fafafa]">
            {current != null ? current.toFixed(1) : "—"}
            <span className="ml-2 text-2xl text-[#fafafa]/40">{target != null ? `→ ${target} °C` : "°C"}</span>
          </p>
        </div>
      </div>
      {/* Legend with each sensor's current value */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="h-2 w-2 self-center rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[#fafafa]/60">{s.label}</span>
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
              <defs><Gradient id="g-heat" color="#ff8a00" opacity={0.3} /></defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
              <XAxis dataKey="t" type="number" domain={clock ? ["dataMin", "dataMax"] : [0, "dataMax"]}
                tickFormatter={(v) => clock
                  ? new Date(v * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : `${Math.round(v)}s`}
                tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={[lo, hi]} width={34} tick={AXIS_TICK} tickLine={false} axisLine={false} unit="°" />
              {target != null && (
                <ReferenceLine y={target} stroke="#ffc400" strokeDasharray="6 4" strokeOpacity={0.8}
                  label={{ value: `${target} °C`, position: "insideTopRight", fill: "#ffc400", fontSize: 12 }} />
              )}
              {shown.filter((s) => s.key !== "temp").map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5}
                  strokeOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
              ))}
              <Area type="monotone" dataKey="temp" stroke="#ff8a00" strokeWidth={3} fill="url(#g-heat)"
                baseValue={lo} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {hint && <p className="text-center text-base text-[#fafafa]/45">{hint}</p>}
    </div>
  );
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
export function GroupTemperatures({ samples, target }: { samples: HeatPoint[]; target: number | null }) {
  const [windowS, setWindowS] = useState(600);
  const now = samples.length ? samples[samples.length - 1].t : 0;
  const shown = samples.filter((p) => now - p.t <= windowS);
  const last = samples[samples.length - 1];
  const sensors = HEAT_SENSORS.filter((s) => shown.some((p) => typeof p[s.key] === "number"));
  const values = shown.flatMap((p) => sensors.map((s) => p[s.key] as number | undefined))
    .filter((v): v is number => typeof v === "number");
  const lo = values.length ? Math.floor(Math.min(...values, target ?? Infinity) - 1) : 0;
  const hi = values.length ? Math.ceil(Math.max(...values, target ?? -Infinity) + 1) : 100;
  // Seconds on the axis whenever the visible span is short (also right after opening the page)
  const span = shown.length ? shown[shown.length - 1].t - shown[0].t : 0;
  const withSeconds = span <= 300;

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-[#fafafa]/50">Temperatures</p>
          <p className="font-mono text-5xl font-bold text-[#fafafa]">
            {typeof last?.temp === "number" ? last.temp.toFixed(1) : "—"}
            <span className="ml-2 text-2xl text-[#fafafa]/40">°C</span>
          </p>
        </div>
        <div className="flex rounded-lg bg-white/[0.06] p-0.5">
          {WINDOWS.map((w) => (
            <button key={w.s} onClick={() => setWindowS(w.s)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                windowS === w.s ? "bg-[#ffc400] text-[#0a0a0a]" : "text-[#fafafa]/60"
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
            <span className="text-[#fafafa]/60">{s.label}</span>
            <span className="font-mono font-bold" style={{ color: s.color }}>
              {typeof last?.[s.key] === "number" ? (last[s.key] as number).toFixed(1) : "—"}
            </span>
          </span>
        ))}
        {target != null && (
          <span className="inline-flex items-baseline gap-1.5 text-sm">
            <span className="w-3.5 self-center border-t-2 border-dotted border-[#ffc400]" />
            <span className="text-[#fafafa]/60">Target</span>
            <span className="font-mono font-bold text-[#ffc400]">{target}</span>
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {shown.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={shown} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" strokeDasharray="2 4" />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => new Date(v * 1000).toLocaleTimeString([], withSeconds
                  ? { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                  : { hour: "2-digit", minute: "2-digit" })}
                tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={50} />
              <YAxis domain={[lo, hi]} allowDecimals={false} width={34} unit="°"
                tick={AXIS_TICK} tickLine={false} axisLine={false} />
              {target != null && (
                <ReferenceLine y={target} stroke="#ffc400" strokeOpacity={0.8} strokeDasharray="2 4" />
              )}
              {sensors.filter((s) => s.key !== "temp").map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.5}
                  strokeOpacity={0.85} dot={false} isAnimationActive={false} connectNulls />
              ))}
              {/* Main temperature on top, thick */}
              <Line type="monotone" dataKey="temp" stroke={HEAT_SENSORS[0].color} strokeWidth={4}
                dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
