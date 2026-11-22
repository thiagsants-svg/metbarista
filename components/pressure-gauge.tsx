"use client";

/**
 * Small analog-style pressure gauge (0–12 bar) for the Station's top row:
 * a 240° arc filled up to the current pressure, a needle, tick marks every
 * 2 bar, and the value in the middle.
 */

const MAX = 12;
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

export function PressureGauge({ value, color = "#ffc400" }: { value: number | null | undefined; color?: string }) {
  const v = value == null || Number.isNaN(value) ? null : Math.max(0, Math.min(MAX, value));
  const cx = 60, cy = 52, r = 42;
  const end = START + (SWEEP * (v ?? 0)) / MAX;
  const needle = polar(cx, cy, r - 10, end);

  return (
    <div className="flex h-full items-center justify-between gap-1 rounded-2xl border border-white/[0.06] bg-[#141414] px-3 py-1">
      <div className="flex flex-col">
        <p className="text-[11px] uppercase tracking-wider text-[#fafafa]/40">Pressure</p>
        <p className="font-mono text-[clamp(1.3rem,3vmax,2.25rem)] font-bold leading-tight" style={{ color }}>
          {v == null ? "—" : v.toFixed(1)}
          <span className="ml-1 text-sm font-medium text-[#fafafa]/40">bar</span>
        </p>
      </div>
      <svg viewBox="0 0 120 96" className="h-full max-h-[84px] w-auto shrink-0" aria-hidden>
        {/* track */}
        <path d={arc(cx, cy, r, START, START + SWEEP)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={9} strokeLinecap="round" />
        {/* value */}
        {v != null && v > 0.05 && (
          <path d={arc(cx, cy, r, START, end)} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" />
        )}
        {/* ticks every 2 bar, labels every 4 */}
        {Array.from({ length: MAX / 2 + 1 }, (_, i) => i * 2).map((bar) => {
          const deg = START + (SWEEP * bar) / MAX;
          const p1 = polar(cx, cy, r - 8, deg);
          const p2 = polar(cx, cy, r - 13, deg);
          const lbl = polar(cx, cy, r - 22, deg);
          return (
            <g key={bar}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
              {bar % 4 === 0 && (
                <text x={lbl.x} y={lbl.y + 3} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.45)">{bar}</text>
              )}
            </g>
          );
        })}
        {/* needle */}
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="#fafafa" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="#fafafa" />
      </svg>
    </div>
  );
}
