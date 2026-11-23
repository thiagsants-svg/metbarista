"use client";

/**
 * After the shot: stars and tasting notes, the same ones as the Shots page
 * (Tasting Notes), so they show there and in the coffee's last-shot summary.
 */

import { useState } from "react";
import { Star } from "lucide-react";

export function ShotRating({
  summary, coffee, onSave, onSkip,
}: {
  /** e.g. "50.4 g · 0:52 · 1:2.52" */
  summary: string;
  coffee?: string;
  onSave: (rating: number, note: string) => void;
  onSkip: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 landscape:items-center" onClick={onSkip}>
      <div className="w-full max-w-lg rounded-t-xl bg-[var(--paper)] p-4 shadow-xl landscape:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">How was this shot?</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--ink)]">{summary}</p>
        {coffee && <p className="truncate text-sm text-[var(--ink)]/75">{coffee}</p>}

        <div className="mt-3 flex justify-center gap-2" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={rating === s} aria-label={`${s} star${s > 1 ? "s" : ""}`}
              onClick={() => setRating(rating === s ? 0 : s)}
              className="flex h-14 w-14 items-center justify-center rounded-md active:scale-90">
              <Star className="h-10 w-10" strokeWidth={1.5}
                fill={rating >= s ? "var(--primary)" : "none"}
                stroke={rating >= s ? "var(--accent)" : "color-mix(in srgb, var(--ink) 35%, transparent)"} />
            </button>
          ))}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Tasting notes (optional): chocolate, a bit sour…"
          className="mt-3 w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink)]/50" />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onSkip}
            className="h-12 rounded-md border border-[var(--ink)]/20 text-base font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
            Skip
          </button>
          <button type="button" disabled={rating === 0 && !note.trim()} onClick={() => onSave(rating, note.trim())}
            className="h-12 rounded-md bg-[var(--primary)] text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
