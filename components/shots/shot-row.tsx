"use client";

/** One shot in the Shots list, in the Station's style: the numbers that matter at a glance */

import { dayTime, timeHM } from "@/lib/format-date";
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
  /** A flush, a test or a shot stopped with almost nothing in the cup: not a real shot */
  flush: boolean;
  /** Why it isn't a real shot ("flush", "only 5.3 g") */
  flushWhy?: string;
  /** Pressure and weight over the shot, each 0..1, for the small curve */
  spark?: { p: number[]; w: number[] };
  /** Seconds to the first drops (2 g in the cup), when the curve was read */
  firstDrops?: number | null;
}

/** The shot's curve in a few pixels: pressure (accent) and the cup filling (weight color) */
function Spark({ p, w }: { p: number[]; w: number[] }) {
  const W = 96, H = 32;
  const line = (v: number[]) => v.map((y, i) => `${i ? "L" : "M"}${((i / Math.max(1, v.length - 1)) * W).toFixed(1)} ${(H - 2 - y * (H - 4)).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-24 shrink-0" aria-hidden>
      <line x1={0} x2={W} y1={H - 1} y2={H - 1} stroke="var(--ink)" strokeOpacity={0.2} />
      {w.length > 1 && <path d={line(w)} fill="none" stroke="var(--weight)" strokeWidth={1.5} strokeOpacity={0.8} />}
      {p.length > 1 && <path d={line(p)} fill="none" stroke="var(--accent)" strokeWidth={2} />}
    </svg>
  );
}

// One clock for the whole app (it rounds first: 59.6 s is "1:00", not "0:60")
export { fmtClock } from "@/lib/station/format";
import { fmtClock } from "@/lib/station/format";

// The shot's grind label (one helper for the whole app)
export { shotGrindLabel as grindText } from "@/lib/coffee-history";
import { shotGrindLabel as grindText } from "@/lib/coffee-history";

export function ShotRow({ row, face, showCoffee, selected, onSelect, timeOnly = false }: {
  row: ShotRowData;
  /** Under a day header: the time alone */
  timeOnly?: boolean;
  face: "like" | "dislike" | null | undefined;
  showCoffee: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { sum: s, notes, grindDelta: d } = row;
  const p = s.patch;
  const grind = grindText(s);
  return (
    <button type="button" onClick={onSelect} aria-current={selected}
      className={`flex w-full items-center gap-3 border-l-4 px-3 py-2.5 text-left active:bg-[var(--ink)]/[0.05] ${
        selected ? "border-[var(--primary)] bg-[var(--ink)]/[0.06]" : "border-transparent"} ${row.flush ? "bg-[var(--ink)]/[0.03]" : ""}`}>
      <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${row.flush ? "opacity-60" : ""}`}>
      <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
        <span className={`${timeOnly ? "w-12" : "w-24"} shrink-0 text-sm tabular-nums text-[var(--ink)]/75`}>
          {timeOnly ? timeHM(s.when) : dayTime(s.when)}
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
        {row.firstDrops != null && (
          <span className="text-sm font-semibold tabular-nums text-[var(--ink)]/80" title="First drops: 2 g in the cup">
            drops {Math.round(row.firstDrops)} s
          </span>
        )}
        {grind && (
          <span className="text-lg font-extrabold tabular-nums">
            {grind}
            {d != null && d !== 0 && (
              <span className="ml-1 text-xs font-semibold text-[var(--accent)]"
                title={`${d > 0 ? "Coarser" : "Finer"} than this coffee's shot before`}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}{s.patch.grindUm != null ? " µm" : ""}
              </span>
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
        {row.flush && (
          <span className="rounded-full border border-dashed border-[var(--ink)]/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/80">
            Not a shot · {row.flushWhy ?? "flush"}
          </span>
        )}
      </span>
      <span className={`truncate ${timeOnly ? "pl-[4.5rem]" : "pl-[7.5rem]"} text-sm text-[var(--ink)]/70`}>
        {[
          showCoffee ? s.coffee || "No coffee" : null,
          s.profileName || null,
          p.dose != null && p.ratio != null ? `${p.dose}g ${formatRatio(p.ratio)}${p.temperature != null ? ` ${p.temperature}°C` : ""}` : null,
          notes.text || null,
        ].filter(Boolean).join(" · ")}
      </span>
      </span>
      {row.spark && <Spark p={row.spark.p} w={row.spark.w} />}
    </button>
  );
}
