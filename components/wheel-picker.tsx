"use client";

/**
 * Phone-style scroll wheel: the value in the middle band is the chosen one.
 * Scrolls with the finger (snapping to each item); tapping an item moves to it.
 */

import { useEffect, useRef } from "react";

const ITEM_H = 44;
const VISIBLE = 5; // odd: one in the middle, two above and two below

export function WheelPicker<T>({
  items, value, onChange, format, label,
}: {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.indexOf(value));

  // Start on the current value (no animation)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ITEM_H;
    // Only when the wheel opens: later changes come from the wheel itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function settled() {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    if (items[i] !== value) onChange(items[i]);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">{label}</p>
      <div className="relative w-full" style={{ height: ITEM_H * VISIBLE }}>
        {/* middle band */}
        <div className="pointer-events-none absolute inset-x-1 rounded-md bg-[var(--primary)]/25 ring-1 ring-[var(--primary)]"
          style={{ top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H }} />
        <div ref={ref} role="listbox" aria-label={label}
          onScroll={() => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(settled, 120);
          }}
          className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingTop: ITEM_H * Math.floor(VISIBLE / 2),
            paddingBottom: ITEM_H * Math.floor(VISIBLE / 2),
            maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
            WebkitMaskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
          }}>
          {items.map((it, i) => (
            <button key={String(it)} type="button" role="option" aria-selected={i === index}
              onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
              className={`block w-full snap-center text-center tabular-nums ${
                i === index ? "text-2xl font-extrabold text-[var(--ink)]" : "text-lg text-[var(--ink)]/60"}`}
              style={{ height: ITEM_H }}>
              {format(it)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
