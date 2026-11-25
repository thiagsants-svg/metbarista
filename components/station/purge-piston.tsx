"use client";

/**
 * The piston during a purge: it follows the machine's own piston (the
 * "sensors" event's m_pos, 0 at the top of its travel to ~76 mm at the
 * bottom), pushing the water out, then rises back home. Our own drawing; the
 * idea of drawing the real position comes from the Meticulous dial's purge
 * screen (MeticulousHome/meticulous-dial).
 */

import { useId } from "react";

/** The piston's full travel, mm */
export const PISTON_TRAVEL_MM = 76;

/** The machine's pressure at rest reads about 0.4 bar (sensor offset): at or under this (shown as 0.4), it's back */
export const RESTING_BAR = 0.45;

/** The piston reached the bottom, but the machine stays in "purge" another 20–30 s while the pressure
 *  comes down (seen by ha-meticulous-cards, cjborchert) */
export function pistonAtBottom(position: number | null, home: boolean): boolean {
  return !home && position != null && position >= PISTON_TRAVEL_MM - 1.5;
}

// Drawing, in viewBox units
const W = 200;
const H = 300;
const CH = { x: 38, y: 34, w: 124, h: 236 }; // the chamber
const DISC = { rx: 56, ry: 11, thick: 16 };
const TOP = CH.y + DISC.ry + 2; // the disc's top face at 0 mm
const TRAVEL = CH.h - DISC.thick - 2 * DISC.ry - 6; // px from 0 mm to the bottom
const FLOOR = CH.y + CH.h - 3; // the chamber's inside bottom
const WATER = 40; // px of water left in the chamber when the purge starts: little

export function PurgePiston({
  position, home, pressure = null, releaseFrom = null, settling = false,
  className = "min-h-0 flex-1 gap-6 rounded-md border border-[var(--ink)]/15 p-3",
}: {
  /** mm; null before the first reading */
  position: number | null;
  /** Rising back home (no water left to push out) */
  home: boolean;
  /** bar, live */
  pressure?: number | null;
  /** bar: the highest pressure since the piston reached the bottom, where the bar starts */
  releaseFrom?: number | null;
  /** The purge is over but the pressure isn't back to rest yet */
  settling?: boolean;
  /** The frame: size, border, padding; side by side or stacked */
  className?: string;
}) {
  const clip = `purge-chamber-${useId().replace(/:/g, "")}`;
  const mm = position == null ? null : Math.min(Math.max(position, 0), PISTON_TRAVEL_MM);
  const y = mm == null ? 0 : (mm / PISTON_TRAVEL_MM) * TRAVEL;
  const cx = W / 2;
  // Readings arrive a few times a second: glide between them
  // The water lies at the bottom; the disc reaches it near the end and squeezes it out
  const waterTop = Math.max(FLOOR - WATER, TOP + DISC.thick + DISC.ry + y);
  const bottom = pistonAtBottom(position, home);
  // Depressurizing: at the bottom, or the purge over with the pressure still up
  const depress = bottom || settling;
  const flowing = !home && !settling;
  const rested = pressure != null && pressure <= RESTING_BAR;
  // From the highest pressure seen down to rest (0.4 bar)
  const from = releaseFrom != null && pressure != null ? Math.max(releaseFrom, pressure) : null;
  const progress = rested ? 1 : from == null || pressure == null || from <= RESTING_BAR ? 0
    : Math.min(1, Math.max(0, (from - pressure) / (from - RESTING_BAR)));
  const showBar = pressure != null && (depress || (home && !rested));
  const move = { transform: `translateY(${y}px)`, transition: "transform 350ms linear" } as const;

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full max-h-[420px] min-h-0 w-auto" role="img"
        aria-label={mm == null ? "Piston" : `Piston at ${mm.toFixed(0)} mm`}>
        <defs>
          <clipPath id={clip}>
            <rect x={CH.x + 3} y={CH.y} width={CH.w - 6} height={CH.h - 3} rx={8} />
          </clipPath>
        </defs>

        {/* The little water left, at the bottom, pushed out through it */}
        {flowing && mm != null && waterTop < FLOOR && (
          <g clipPath={`url(#${clip})`}>
            <rect x={CH.x} y={waterTop} width={CH.w} height={FLOOR - waterTop} fill="var(--water)" fillOpacity={0.3}
              style={{ transition: "y 350ms linear, height 350ms linear" }} />
          </g>
        )}

        {/* The chamber, open at the top, the group head below */}
        <path d={`M${CH.x} ${CH.y} V${CH.y + CH.h - 10} Q${CH.x} ${CH.y + CH.h} ${CH.x + 10} ${CH.y + CH.h}
          H${CH.x + CH.w - 10} Q${CH.x + CH.w} ${CH.y + CH.h} ${CH.x + CH.w} ${CH.y + CH.h - 10} V${CH.y}`}
          fill="none" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={3} strokeLinejoin="round" />
        <rect x={cx - 22} y={CH.y + CH.h + 4} width={44} height={8} rx={2} fill="var(--ink)" fillOpacity={0.35} />
        {flowing && mm != null && mm < PISTON_TRAVEL_MM - 1 && (
          <g fill="var(--water)" fillOpacity={0.7}>
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={cx} r={3} className="motion-safe:animate-purge-drip"
                style={{ animationDelay: `${i * 0.3}s` }} cy={CH.y + CH.h + 18} />
            ))}
          </g>
        )}

        {/* The rod and the disc, moving together */}
        <g style={move}>
          <rect x={cx - 8} y={TOP - H} width={16} height={H} rx={3} fill="var(--ink)" fillOpacity={0.8} />
          <path d={`M${cx - DISC.rx} ${TOP} V${TOP + DISC.thick} A${DISC.rx} ${DISC.ry} 0 0 0 ${cx + DISC.rx} ${TOP + DISC.thick} V${TOP}`}
            fill="var(--ink)" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
          <ellipse cx={cx} cy={TOP} rx={DISC.rx} ry={DISC.ry} fill="var(--ink)" stroke="var(--accent)" strokeWidth={2.5} />
          <ellipse cx={cx} cy={TOP} rx={12} ry={3} fill="var(--paper)" fillOpacity={0.25} />
        </g>
      </svg>

      <div className="w-60 min-w-0 max-w-full">
        <p className={`text-sm font-semibold uppercase tracking-wider ${depress && rested ? "text-[var(--good)]" : "text-[var(--ink)]/70"}`}>
          {home ? "Raising the piston" : depress ? (rested ? "Pressure at rest" : "Depressurizing") : "Purging"}
        </p>
        {/* While it depressurizes the pressure is what matters (the piston sits at the bottom) */}
        {depress && pressure != null ? (
          <p className="text-4xl font-extrabold tabular-nums">
            {Math.max(0, pressure).toFixed(1)}<span className="ml-1 text-lg font-medium text-[var(--ink)]/70">bar</span>
          </p>
        ) : (
          <p className="text-4xl font-extrabold tabular-nums">
            {mm == null ? "—" : mm.toFixed(0)}<span className="ml-1 text-lg font-medium text-[var(--ink)]/70">mm</span>
          </p>
        )}
        {showBar && (
          <div className="mt-2 w-full">
            <div role="progressbar" aria-label="Pressure down to 0.4 bar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)} className="h-3 overflow-hidden rounded-full bg-[var(--ink)]/15">
              {/* Stripes run along it while the pressure comes down; still and green once it rests */}
              <div className={`h-full rounded-full transition-[width] duration-300 ${rested ? "bg-[#10b981]" : "bg-[var(--accent)] motion-safe:animate-bar-stripes"}`}
                style={{
                  width: `${Math.max(progress, rested ? 1 : 0.04) * 100}%`,
                  ...(rested ? {} : {
                    backgroundImage: "linear-gradient(135deg, rgb(255 255 255 / 0.28) 25%, transparent 25%, transparent 50%, rgb(255 255 255 / 0.28) 50%, rgb(255 255 255 / 0.28) 75%, transparent 75%, transparent)",
                    backgroundSize: "20px 20px",
                  }),
                }} />
            </div>
            <p className="mt-1 flex justify-between text-xs tabular-nums text-[var(--ink)]/65">
              <span>{from != null && from > RESTING_BAR ? `${from.toFixed(1)} bar` : ""}</span>
              <span>0.4 bar</span>
            </p>
          </div>
        )}
        {/* With the bar, the drawing says where the piston is */}
        {!showBar && (
          <p className="mt-1 text-sm text-[var(--ink)]/70">{home ? "Back to the top" : depress ? "Piston at the bottom" : "Pushing the water out"}</p>
        )}
      </div>
    </div>
  );
}
