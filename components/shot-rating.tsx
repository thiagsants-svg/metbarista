"use client";

/**
 * After the shot: the official app's faces (like / dislike), saved on the
 * machine so every app shows them, plus optional tasting notes (Shots page).
 */

import { useState } from "react";
import { Frown, Smile } from "lucide-react";

export type Face = "like" | "dislike";

export function ShotRating({
  summary, coffee, recipe, onSave, onSkip,
}: {
  /** e.g. "50.4 g · 0:52 · 1:2.52" */
  summary: string;
  coffee?: string;
  /** e.g. "20 g · 1:2.5 · 94 °C · Motto 80 140µm feed 65 1000rpm" */
  recipe?: string;
  onSave: (face: Face | null, note: string) => void;
  onSkip: () => void;
}) {
  const [face, setFace] = useState<Face | null>(null);
  const [note, setNote] = useState("");

  const faceBtn = (f: Face, label: string, Icon: typeof Smile) => {
    const on = face === f;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={label}
        onClick={() => setFace(on ? null : f)}
        className={`flex h-20 flex-1 flex-col items-center justify-center gap-1 rounded-md border-2 active:scale-[0.97] ${
          on ? "border-[var(--accent)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/20 text-[var(--ink)]/70"}`}>
        <Icon className="h-9 w-9" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 landscape:items-center" onClick={onSkip}>
      <div className="w-full max-w-lg rounded-t-xl bg-[var(--paper)] p-4 shadow-xl landscape:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">How was this shot?</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--ink)]">{summary}</p>
        <div className="mt-2 rounded-md border border-[var(--ink)]/15 px-3 py-2">
          <p className="truncate text-base font-semibold text-[var(--ink)]">{coffee?.trim() || "No coffee set"}</p>
          {recipe && <p className="text-sm tabular-nums text-[var(--ink)]/75">{recipe}</p>}
        </div>

        <div className="mt-3 flex gap-3" role="radiogroup" aria-label="Rating">
          {faceBtn("like", "Liked it", Smile)}
          {faceBtn("dislike", "Didn’t like it", Frown)}
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Tasting notes (optional): chocolate, a bit sour…"
          className="mt-3 w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink)]/50" />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onSkip}
            className="h-12 rounded-md border border-[var(--ink)]/20 text-base font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
            Skip
          </button>
          <button type="button" disabled={!face && !note.trim()} onClick={() => onSave(face, note.trim())}
            className="h-12 rounded-md bg-[var(--primary)] text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
