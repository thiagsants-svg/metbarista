"use client";

/**
 * Espresso brew control chart, like DiFluid's: extraction (EY %) across,
 * strength (TDS %) up. Grey lines are ratios (TDS = EY / ratio), the box is
 * the target for the shot's style, the big dot is this shot and the faded
 * dots are this coffee's earlier shots with a reading.
 */

import type { BrewTarget } from "@/lib/brew-control";
import { formatRatio } from "@/lib/recipe";

export interface BrewPoint { tds: number; ey: number }

const RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const W = 320, H = 190;
const PAD = { l: 30, r: 10, t: 8, b: 24 };

export function BrewChart({ shot, past = [], target }: { shot: BrewPoint; past?: BrewPoint[]; target: BrewTarget }) {
  const all = [shot, ...past];
  const x0 = Math.floor(Math.min(14, ...all.map((p) => p.ey - 1)));
  const x1 = Math.ceil(Math.max(26, ...all.map((p) => p.ey + 1)));
  const y0 = Math.max(0, Math.floor(Math.min(target.tds[0] - 3, ...all.map((p) => p.tds - 1))));
  const y1 = Math.ceil(Math.max(target.tds[1] + 3, ...all.map((p) => p.tds + 1)));
  const sx = (ey: number) => PAD.l + ((ey - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (tds: number) => H - PAD.b - ((tds - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const xStep = x1 - x0 > 14 ? 4 : 2;
  const yStep = y1 - y0 > 12 ? 4 : 2;
  const xTicks = range(Math.ceil(x0 / xStep) * xStep, x1, xStep);
  const yTicks = range(Math.ceil(y0 / yStep) * yStep, y1, yStep);

  // Ratio lines that cross the plot; label where each leaves it (top or right edge)
  const lines = RATIOS.flatMap((r) => {
    const a = { ey: x0, tds: x0 / r };
    const b = { ey: x1, tds: x1 / r };
    if (b.tds < y0 || a.tds > y1) return [];
    const end = b.tds > y1 ? { ey: y1 * r, tds: y1 } : b;
    const start = a.tds < y0 ? { ey: y0 * r, tds: y0 } : a;
    return [{ r, start, end }];
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Brew chart: TDS ${shot.tds.toFixed(2)}%, EY ${shot.ey.toFixed(1)}%, target ${target.name}`}>
      <defs>
        <clipPath id="brew-plot"><rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} /></clipPath>
      </defs>
      {/* Grid and axes */}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink)" strokeOpacity={0.08} />
          <text x={sx(v)} y={H - PAD.b + 12} textAnchor="middle" fontSize={10} fill="var(--ink)" fillOpacity={0.6}>{v}</text>
        </g>
      ))}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="var(--ink)" strokeOpacity={0.08} />
          <text x={PAD.l - 4} y={sy(v) + 3} textAnchor="end" fontSize={10} fill="var(--ink)" fillOpacity={0.6}>{v}</text>
        </g>
      ))}
      <text x={W - PAD.r} y={H - 2} textAnchor="end" fontSize={9} fill="var(--ink)" fillOpacity={0.6}>EY %</text>
      <text x={2} y={PAD.t + 6} fontSize={9} fill="var(--ink)" fillOpacity={0.6}>TDS</text>

      <g clipPath="url(#brew-plot)">
        {/* Target box */}
        <rect x={sx(target.ey[0])} y={sy(target.tds[1])} width={sx(target.ey[1]) - sx(target.ey[0])}
          height={sy(target.tds[0]) - sy(target.tds[1])} fill="var(--primary)" fillOpacity={0.14}
          stroke="var(--primary)" strokeOpacity={0.6} strokeDasharray="4 3" />
        {/* Ratio lines */}
        {lines.map(({ r, start, end }) => (
          <line key={r} x1={sx(start.ey)} y1={sy(start.tds)} x2={sx(end.ey)} y2={sy(end.tds)}
            stroke="var(--ink)" strokeOpacity={0.22} />
        ))}
        {/* Earlier shots of this coffee */}
        {past.map((p, i) => (
          <circle key={i} cx={sx(p.ey)} cy={sy(p.tds)} r={4} fill="var(--ink)" fillOpacity={0.3} />
        ))}
        {/* This shot */}
        <circle cx={sx(shot.ey)} cy={sy(shot.tds)} r={7} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2} />
      </g>
      {lines.map(({ r, end }) => {
        const top = end.tds >= y1 - 1e-6;
        return (
          <text key={`l${r}`} x={sx(end.ey) + (top ? 0 : -2)} y={sy(end.tds) + (top ? 9 : -3)}
            textAnchor={top ? "middle" : "end"} fontSize={9} fill="var(--ink)" fillOpacity={0.55}>
            {formatRatio(r)}
          </text>
        );
      })}
      <text x={sx(target.ey[0]) + 3} y={sy(target.tds[1]) + 10} fontSize={9} fontWeight={600}
        fill="var(--primary)">{target.name}</text>
    </svg>
  );
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
}
