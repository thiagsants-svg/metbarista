"use client";

/**
 * Espresso brew control chart, like DiFluid's: extraction (EY %) across,
 * strength (TDS %) up. The target box splits the chart into zones (under /
 * ideal / over extraction, weak / ideal / strong), grey lines are ratios
 * (TDS = EY / ratio), the big dot is this shot and the faded dots, joined
 * oldest to newest, are this coffee's earlier shots with a reading.
 */

import type { BrewTarget } from "@/lib/brew-control";
import { formatRatio } from "@/lib/recipe";

export interface BrewPoint { tds: number; ey: number }

const RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const W = 372, H = 250;
const PAD = { l: 30, r: 62, t: 22, b: 30 };
const PW = W - PAD.l - PAD.r, PH = H - PAD.t - PAD.b;

/** past: newest first (as the shot list) */
export function BrewChart({ shot, past = [], target }: { shot: BrewPoint; past?: BrewPoint[]; target: BrewTarget }) {
  const all = [shot, ...past];
  const x0 = Math.floor(Math.min(14, ...all.map((p) => p.ey - 1)));
  const x1 = Math.ceil(Math.max(26, ...all.map((p) => p.ey + 1)));
  const y0 = Math.max(0, Math.floor(Math.min(target.tds[0] - 3, ...all.map((p) => p.tds - 1))));
  const y1 = Math.ceil(Math.max(target.tds[1] + 3, ...all.map((p) => p.tds + 1)));
  const sx = (ey: number) => PAD.l + ((ey - x0) / (x1 - x0)) * PW;
  const sy = (tds: number) => PAD.t + PH - ((tds - y0) / (y1 - y0)) * PH;
  const xTicks = range(Math.ceil(x0 / 2) * 2, x1, 2);
  const yTicks = range(Math.ceil(y0 / 2) * 2, y1, 2);

  // The ratio line closest to this shot gets drawn darker
  const shotRatio = shot.ey / shot.tds;
  const nearR = RATIOS.reduce((b, r) => (Math.abs(r - shotRatio) < Math.abs(b - shotRatio) ? r : b));

  // Ratio lines that cross the plot; label where each leaves it (top or right edge)
  const lines = RATIOS.flatMap((r) => {
    const a = { ey: x0, tds: x0 / r };
    const b = { ey: x1, tds: x1 / r };
    if (b.tds < y0 || a.tds > y1) return [];
    const end = b.tds > y1 ? { ey: y1 * r, tds: y1 } : b;
    const start = a.tds < y0 ? { ey: y0 * r, tds: y0 } : a;
    return [{ r, start, end, top: b.tds > y1 }];
  });

  const bx0 = sx(target.ey[0]), bx1 = sx(target.ey[1]);
  const by0 = sy(target.tds[1]), by1 = sy(target.tds[0]);
  const trail = [...past].reverse().concat(shot);
  // Value label above the dot, or below when it would leave the plot
  const labelBelow = sy(shot.tds) < PAD.t + 26;
  const labelX = Math.min(Math.max(sx(shot.ey), PAD.l + 60), PAD.l + PW - 60);
  const zone = { fontSize: 11, fontWeight: 600, fill: "var(--ink)", fillOpacity: 0.5, letterSpacing: 0.6 } as const;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Brew chart: TDS ${shot.tds.toFixed(2)}%, EY ${shot.ey.toFixed(1)}%, target ${target.name}`}>
      <defs>
        <clipPath id="brew-plot"><rect x={PAD.l} y={PAD.t} width={PW} height={PH} /></clipPath>
      </defs>

      {/* Zone names: extraction along the top, strength down the right */}
      <text x={(PAD.l + bx0) / 2} y={14} textAnchor="middle" {...zone}>UNDER</text>
      <text x={(bx0 + bx1) / 2} y={14} textAnchor="middle" {...zone} fillOpacity={0.9} fontWeight={800}>IDEAL</text>
      <text x={(bx1 + PAD.l + PW) / 2} y={14} textAnchor="middle" {...zone}>OVER</text>
      <text x={PAD.l + PW + 6} y={(PAD.t + by0) / 2 + 4} {...zone}>STRONG</text>
      <text x={PAD.l + PW + 6} y={(by0 + by1) / 2 + 4} {...zone} fillOpacity={0.9} fontWeight={800}>IDEAL</text>
      <text x={PAD.l + PW + 6} y={(by1 + PAD.t + PH) / 2 + 4} {...zone}>WEAK</text>

      <rect x={PAD.l} y={PAD.t} width={PW} height={PH} fill="none" stroke="var(--ink)" strokeOpacity={0.2} />
      {xTicks.map((v) => (
        <text key={`x${v}`} x={sx(v)} y={H - PAD.b + 15} textAnchor="middle" fontSize={11} fill="var(--ink)" fillOpacity={0.65}>{v}</text>
      ))}
      {yTicks.map((v) => (
        <text key={`y${v}`} x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink)" fillOpacity={0.65}>{v}</text>
      ))}
      <text x={PAD.l + PW} y={H - 2} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--ink)" fillOpacity={0.7}>EY %</text>
      <text x={2} y={PAD.t - 8} fontSize={11} fontWeight={600} fill="var(--ink)" fillOpacity={0.7}>TDS %</text>

      <g clipPath="url(#brew-plot)">
        {/* Bands through the target box split the chart into zones */}
        <rect x={bx0} y={PAD.t} width={bx1 - bx0} height={PH} fill="var(--primary)" fillOpacity={0.07} />
        <rect x={PAD.l} y={by0} width={PW} height={by1 - by0} fill="var(--primary)" fillOpacity={0.07} />
        <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} fill="var(--primary)" fillOpacity={0.22}
          stroke="var(--primary)" strokeWidth={1.5} />
        {/* Ratio lines */}
        {lines.map(({ r, start, end }) => (
          <line key={r} x1={sx(start.ey)} y1={sy(start.tds)} x2={sx(end.ey)} y2={sy(end.tds)}
            stroke="var(--ink)" strokeOpacity={r === nearR ? 0.5 : 0.16} strokeWidth={r === nearR ? 1.5 : 1} />
        ))}
        {/* This coffee's earlier shots, joined oldest to newest up to this one */}
        {trail.length > 1 && (
          <polyline points={trail.map((p) => `${sx(p.ey)},${sy(p.tds)}`).join(" ")} fill="none"
            stroke="var(--ink)" strokeOpacity={0.3} strokeWidth={1.25} strokeDasharray="3 3" />
        )}
        {past.map((p, i) => (
          <circle key={i} cx={sx(p.ey)} cy={sy(p.tds)} r={4.5} fill="var(--paper)" stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.5} />
        ))}
        {/* This shot */}
        <circle cx={sx(shot.ey)} cy={sy(shot.tds)} r={12} fill="var(--accent)" fillOpacity={0.18} />
        <circle cx={sx(shot.ey)} cy={sy(shot.tds)} r={6.5} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2} />
      </g>

      {lines.map(({ r, end, top }) => (
        <text key={`l${r}`} x={top ? sx(end.ey) : PAD.l + PW - 3} y={top ? PAD.t + 12 : sy(end.tds) - 4}
          textAnchor={top ? "middle" : "end"} fontSize={10} fontWeight={r === nearR ? 700 : 400}
          fill="var(--ink)" fillOpacity={r === nearR ? 0.85 : 0.45}>
          {formatRatio(r)}
        </text>
      ))}
      <text x={bx0 + 4} y={by0 + 13} fontSize={11} fontWeight={700} fill="var(--ink)" fillOpacity={0.75}>{target.name}</text>

      {/* The shot's numbers next to its dot */}
      <g transform={`translate(${labelX}, ${labelBelow ? sy(shot.tds) + 18 : sy(shot.tds) - 30})`}>
        <rect x={-58} y={0} width={116} height={18} rx={4} fill="var(--ink)" />
        <text x={0} y={13} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--paper)">
          EY {shot.ey.toFixed(1)} · TDS {shot.tds.toFixed(2)}
        </text>
      </g>
    </svg>
  );
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
}
