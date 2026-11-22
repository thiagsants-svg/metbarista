"use client";

/**
 * Small analog-style gauge for the Station's top row: a 240° arc filled up to
 * the current value, a needle, tick marks, the value in big digits beside it,
 * and an optional target mark.
 *
 * Pressure (0–12 bar) during the shot; temperature (20–100 °C, with the shot
 * temperature marked) while the machine heats.
 */

const START = 150; // degrees (clockwise from +x), lower-left
const SWEEP = 240; // to lower-right

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function Gauge({
  label, unit, value, min, max, tickEvery, labelEvery, color, target, digits = 1,
}: {
  label: string;
  unit: string;
  value: number | null | undefined;
  min: number;
  max: number;
  tickEvery: number;
  labelEvery: number;
  color: string;
  /** Marked on the arc (yellow tick) */
  target?: number | null;
  digits?: number;
}) {
  const raw = value == null || Number.isNaN(value) ? null : value;
  const v = raw == null ? null : Math.max(min, Math.min(max, raw));
  const cx = 60, cy = 52, r = 42;
  const angle = (x: number) => START + (SWEEP * (x - min)) / (max - min);
  const end = angle(v ?? min);
  const needle = polar(cx, cy, r - 10, end);
  const ticks = Array.from({ length: Math.round((max - min) / tickEvery) + 1 }, (_, i) => min + i * tickEvery);

  return (
    <div className="flex h-full items-center justify-between gap-1 border-t-2 border-[#111] pt-1">
      <div className="flex min-w-0 flex-col">
        <p className="text-[11px] uppercase tracking-wider text-[#111]/40">{label}</p>
        <p className="whitespace-nowrap text-[clamp(1.5rem,3.3vmax,2.6rem)] font-extrabold tracking-tight leading-tight" style={{ color }}>
          {raw == null ? "—" : raw.toFixed(digits)}
          <span className="ml-1 text-sm font-medium text-[#111]/40">
            {unit}
          </span>
        </p>
      </div>
      <svg viewBox="0 0 120 96" className="h-full max-h-[84px] w-auto shrink-0" aria-hidden>
        <path d={arc(cx, cy, r, START, START + SWEEP)} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={9} strokeLinecap="round" />
        {v != null && v > min + (max - min) * 0.005 && (
          <path d={arc(cx, cy, r, START, end)} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />
        )}
        {ticks.map((x) => {
          const deg = angle(x);
          const p1 = polar(cx, cy, r - 8, deg);
          const p2 = polar(cx, cy, r - 13, deg);
          const lbl = polar(cx, cy, r - 22, deg);
          return (
            <g key={x}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5} />
              {(x - min) % labelEvery === 0 && (
                <text x={lbl.x} y={lbl.y + 3} textAnchor="middle" fontSize={9} fill="rgba(0,0,0,0.6)">{x}</text>
              )}
            </g>
          );
        })}
        {/* target mark just outside the arc */}
        {target != null && target >= min && target <= max && (() => {
          const a = polar(cx, cy, r + 2, angle(target));
          const b = polar(cx, cy, r + 9, angle(target));
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e30613" strokeWidth={3} strokeLinecap="round" />;
        })()}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#111" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="#111" />
      </svg>
    </div>
  );
}

export function PressureGauge({ value, color = "#e30613" }: { value: number | null | undefined; color?: string }) {
  return <Gauge label="Pressure" unit="bar" value={value} min={0} max={12} tickEvery={2} labelEvery={4} color={color} />;
}

export function TemperatureGauge({
  value, target, color = "#c2410c",
}: { value: number | null | undefined; target?: number | null; color?: string }) {
  return (
    <Gauge label="Temperature" unit="°C" value={value} min={20} max={100} tickEvery={10} labelEvery={20}
      color={color} target={target} />
  );
}
