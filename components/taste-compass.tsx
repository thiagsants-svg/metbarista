"use client";

/**
 * The taste compass (lib/taste-compass.ts): tap or drag on the square where
 * the shot sits, extraction across (under: sour ↔ over: bitter), strength up
 * and down. As in Barista Hustle's Espresso Compass: under-extracted and
 * strong at the top left (yellow), the sweet spot along the middle (green),
 * over-extracted and weak at the bottom right (red); a few words of what each
 * part tastes like. The circle in the middle is "balanced".
 */

import { useRef } from "react";
import { COMPASS_DEADBAND, compassBody, compassTaste, compassText, type CompassPoint } from "@/lib/taste-compass";

/** Faint words on the square, where they usually sit (x: under → over, y: weak → strong) */
const WORDS: [string, number, number][] = [
  ["Salty", -0.45, 0.8], ["Sour", -0.78, 0.45], ["Thick", 0.25, 0.8], ["Sweet", 0.42, 0.38],
  ["Bland", -0.25, -0.78], ["Thin", -0.65, -0.5], ["Bitter", 0.78, -0.3], ["Dry", 0.45, -0.62], ["Watery", 0.66, -0.85],
];

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export function TasteCompass({ value, onChange, size = 200 }: {
  value: CompassPoint | null;
  onChange: (p: CompassPoint | null) => void;
  /** px, the square's side */
  size?: number;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const place = (e: React.PointerEvent) => {
    const r = padRef.current?.getBoundingClientRect();
    if (!r) return;
    onChange({
      x: clamp(((e.clientX - r.left) / r.width) * 2 - 1),
      y: clamp(1 - ((e.clientY - r.top) / r.height) * 2),
    });
  };

  const axis = "pointer-events-none absolute text-[11px] font-semibold uppercase tracking-wider text-[var(--ink)]/65";
  const reading = value ? compassText(compassTaste(value), compassBody(value)) : null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative px-6 py-5">
        <span className={`${axis} left-1/2 top-0 -translate-x-1/2`}>Strong</span>
        <span className={`${axis} bottom-0 left-1/2 -translate-x-1/2`}>Weak</span>
        <span className={`${axis} left-0 top-1/2 -translate-x-[38%] -translate-y-1/2 -rotate-90 whitespace-nowrap`}>Under · sour</span>
        <span className={`${axis} right-0 top-1/2 translate-x-[38%] -translate-y-1/2 rotate-90 whitespace-nowrap`}>Over · bitter</span>
        <div ref={padRef} role="group" aria-label={`Taste compass, sour to bitter and weak to strong: ${reading ?? "not set"}`}
          className="relative touch-none overflow-hidden rounded-lg border border-[var(--ink)]/20"
          style={{ width: size, height: size }}
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
          onPointerMove={(e) => { if (dragging.current) place(e); }}
          onPointerUp={() => { dragging.current = false; }}
          onPointerCancel={() => { dragging.current = false; }}>
          {/* Under and strong (yellow) → the sweet spot (green) → over and weak (red) */}
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, rgb(250 204 21 / 0.42), rgb(16 185 129 / 0.32) 50%, rgb(239 68 68 / 0.38))" }} />
          {WORDS.map(([w, x, y]) => (
            <span key={w} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[11px] text-[var(--ink)]/55"
              style={{ left: `${((x + 1) / 2) * 100}%`, top: `${((1 - y) / 2) * 100}%` }}>{w}</span>
          ))}
          <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--ink)]/15" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--ink)]/15" />
          {/* Balanced */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#10b981]/50 bg-[#10b981]/15"
            style={{ width: size * COMPASS_DEADBAND, height: size * COMPASS_DEADBAND }} />
          {value && (
            <div className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper)] bg-[var(--ink)] shadow"
              style={{ left: `${((value.x + 1) / 2) * 100}%`, top: `${((1 - value.y) / 2) * 100}%` }} />
          )}
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm">
        <b className="text-base text-[var(--ink)]">{reading ?? "Tap where the shot sits"}</b>
        {value && (
          <button type="button" onClick={() => onChange(null)}
            className="rounded-full border border-[var(--ink)]/25 px-2.5 py-0.5 text-xs font-semibold text-[var(--ink)]/75 active:scale-95">
            Clear
          </button>
        )}
      </p>
    </div>
  );
}
