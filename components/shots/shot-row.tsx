"use client";

/** One shot in the Shots list, in the Station's style: the numbers that matter at a glance */

import { Frown, Smile } from "lucide-react";
import type { CoffeeLastShot } from "@/lib/coffee-history";
import type { ShotNoteParts } from "@/lib/shot-record";
import { compassText } from "@/lib/taste-compass";
import { formatRatio } from "@/lib/recipe";

export interface ShotRowData {
  id: string;
  sum: CoffeeLastShot;
  notes: ShotNoteParts;
  /** Grind change against the coffee's previous shot */
  grindDelta: number | null;
  /** A flush or a test, not a real shot */
  flush: boolean;
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function grindText(s: CoffeeLastShot): string | null {
  if (s.patch.grindUm != null) return `${s.patch.grindUm} µm`;
  if (s.patch.grindSetting != null) return `grind ${s.patch.grindSetting}`;
  return null;
}

export function ShotRow({ row, face, showCoffee, selected, onSelect }: {
  row: ShotRowData;
  face: "like" | "dislike" | null | undefined;
  showCoffee: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { sum: s, notes, grindDelta: d } = row;
  const p = s.patch;
  const when = new Date(s.when);
  const grind = grindText(s);
  return (
    <button type="button" onClick={onSelect} aria-current={selected}
      className={`flex w-full flex-col gap-0.5 border-l-4 px-3 py-2.5 text-left active:bg-[var(--ink)]/[0.05] ${
        selected ? "border-[var(--primary)] bg-[var(--ink)]/[0.06]" : "border-transparent"} ${row.flush ? "opacity-50" : ""}`}>
      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
        <span className="w-24 shrink-0 text-sm tabular-nums text-[var(--ink)]/75">
          {when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" · "}
          {when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </span>
        <span className="flex w-6 shrink-0 self-center justify-center"
          aria-label={face === "like" ? "Liked" : face === "dislike" ? "Didn't like" : "Not rated"}>
          {face === "like" && <Smile className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} />}
          {face === "dislike" && <Frown className="h-5 w-5 text-[var(--ink)]/80" strokeWidth={1.75} />}
        </span>
        <span className="text-lg font-extrabold tabular-nums">
          {s.weight.toFixed(1)}<span className="ml-0.5 text-xs font-medium text-[var(--ink)]/70">g</span>
        </span>
        <span className="text-lg font-extrabold tabular-nums">{fmtClock(s.seconds)}</span>
        {grind && (
          <span className="text-lg font-extrabold tabular-nums">
            {grind}
            {d != null && d !== 0 && (
              <span className="ml-1 text-xs font-semibold text-[var(--accent)]">{d > 0 ? `+${d}` : `−${Math.abs(d)}`}</span>
            )}
          </span>
        )}
        {s.ey != null && (
          <span className="text-sm font-semibold tabular-nums text-[var(--ink)]/85">
            EY {s.ey.toFixed(1)}%{s.tds != null ? ` · TDS ${s.tds.toFixed(2)}` : ""}
          </span>
        )}
        {(notes.taste || notes.body) && (
          <span className="rounded-full border border-[var(--ink)]/25 px-2 py-0.5 text-xs font-semibold text-[var(--ink)]/80">
            {compassText(notes.taste, notes.body)}
          </span>
        )}
        {row.flush && <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/60">flush</span>}
      </span>
      <span className="truncate pl-[7.5rem] text-sm text-[var(--ink)]/70">
        {[
          showCoffee ? s.coffee || "No coffee" : null,
          p.dose != null && p.ratio != null ? `${p.dose}g ${formatRatio(p.ratio)} ${p.temperature ?? ""}°C` : s.profileName,
          notes.text || null,
        ].filter(Boolean).join(" · ")}
      </span>
    </button>
  );
}
