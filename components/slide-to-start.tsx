"use client";

/**
 * Slide to confirm: drag the knob to the end to fire the action. Avoids a
 * stray tap starting the machine. Released early, the knob springs back.
 */

import { useRef, useState } from "react";
import { ChevronsRight, Play } from "lucide-react";

export function SlideToStart({
  label, hint, onConfirm, disabled, className = "",
}: {
  label: string;
  hint?: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; max: number } | null>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Travel of the knob, measured when a drag starts */
  const [span, setSpan] = useState(1);
  const progress = Math.min(1, x / Math.max(1, span));

  const max = () => {
    const t = track.current, k = knob.current;
    return t && k ? t.clientWidth - k.offsetWidth - 8 : 0; // 4px inset each side
  };

  return (
    <div ref={track} role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)} aria-disabled={disabled}
      className={`relative flex select-none touch-none items-center overflow-hidden rounded-md bg-[var(--primary)] text-[var(--on-primary)] ${
        disabled ? "opacity-50" : ""} ${className}`}>
      {/* label fades as the knob moves */}
      <div className="pointer-events-none flex w-full flex-col items-center justify-center gap-1 pl-16"
        style={{ opacity: Math.max(0.15, 1 - progress) }}>
        <span className="flex items-center gap-1.5 text-3xl font-bold landscape:text-2xl">
          {label} <ChevronsRight className="h-7 w-7 animate-pulse" />
        </span>
        {hint && <span className="text-sm font-medium opacity-75">{hint}</span>}
      </div>
      <div ref={knob}
        onPointerDown={(e) => {
          if (disabled) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
          const m = max();
          drag.current = { startX: e.clientX - x, max: m };
          setSpan(m);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setX(Math.min(drag.current.max, Math.max(0, e.clientX - drag.current.startX)));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          setX(0);
          // Where the finger was let go (not the last drawn position: a fast swipe skips frames)
          if (d && e.clientX - d.startX >= d.max * 0.9) onConfirm();
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false); setX(0); }}
        className={`absolute left-1 top-1/2 flex aspect-square h-[min(calc(100%-8px),76px)] cursor-grab items-center justify-center rounded-md bg-[var(--ink)] text-[var(--primary)] shadow-md ${
          dragging ? "" : "transition-transform duration-300"}`}
        style={{ transform: `translate(${x}px, -50%)` }}>
        <Play className="h-8 w-8" fill="currentColor" />
      </div>
    </div>
  );
}
