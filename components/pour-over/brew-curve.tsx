/** A brew's water over time, with its pours shaded (SVG, drawn in on first show) */

import type { Pour } from "@/lib/pour-over";
import { fmtClock } from "@/lib/pour-over";

export function BrewCurve({ curve, pours, target, tEnd, live = false }: {
  curve: [number, number][];
  pours: Pour[];
  /** The recipe's plan as [s, g] points (a staircase), drawn dashed */
  target?: [number, number][];
  /** s the axis should reach (live: a bit past now) */
  tEnd?: number;
  /** Drawn as it comes in: no draw-in animation */
  live?: boolean;
}) {
  const W = 600, H = 160, L = 34, B = 18;
  const tMax = Math.max(30, tEnd ?? 0, ...curve.map((c) => c[0]));
  const wMax = Math.max(50, ...curve.map((c) => c[1]), ...(target ?? []).map((c) => c[1])) * 1.08;
  const x = (t: number) => L + (Math.max(0, t) / tMax) * (W - L - 6);
  const y = (w: number) => H - B - (Math.max(0, w) / wMax) * (H - B - 8);
  const d = curve.map(([t, w], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(w).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((k) => Math.round(wMax * k / 10) * 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Water poured over time">
      <style>{`.bc-line{stroke-dasharray:2000;stroke-dashoffset:2000;animation:bc-draw 1.2s ease-out forwards}
        @keyframes bc-draw{to{stroke-dashoffset:0}} @media (prefers-reduced-motion: reduce){.bc-line{animation:none;stroke-dashoffset:0}}`}</style>
      {pours.map((p, i) => (
        <rect key={i} x={x(p.start)} y={8} width={Math.max(2, x(p.end ?? p.start + 1) - x(p.start))} height={H - B - 8}
          fill="var(--accent)" opacity=".12" />
      ))}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} stroke="var(--ink)" strokeOpacity=".12" strokeDasharray="2 4" />
          <text x={L - 4} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink)" opacity=".6">{t}</text>
        </g>
      ))}
      <text x={L} y={H - 4} fontSize="11" fill="var(--ink)" opacity=".6">0:00</text>
      <text x={W - 6} y={H - 4} fontSize="11" textAnchor="end" fill="var(--ink)" opacity=".6">{fmtClock(tMax)}</text>
      {target && target.length > 1 && (
        <path d={target.map(([t, w], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(w).toFixed(1)}`).join(" ")}
          fill="none" stroke="var(--ink)" strokeOpacity=".45" strokeWidth="1.5" strokeDasharray="5 4" />
      )}
      <path className={live ? undefined : "bc-line"} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
