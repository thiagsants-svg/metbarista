"use client";

/**
 * Stage by stage (lib/stage-summary.ts): each stage's time, grams, pressure
 * and flow, and how it ended; the pre-infusion as a whole on top.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { endText, type StageSummary } from "@/lib/stage-summary";

const s1 = (ms: number) => (ms / 1000).toFixed(1);

export function StageTable({ summary }: { summary: StageSummary }) {
  const { stages, preinfusion } = summary;
  /** Folded to one line (pre-infusion and how many stages); the table on a tap */
  const [open, setOpen] = useState(false);
  if (!stages.length) return null;
  return (
    <section aria-labelledby="stages-title" className="rounded-md border border-[var(--ink)]/15 px-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-1.5 text-left text-sm">
        <span id="stages-title" className="font-semibold uppercase tracking-wider text-[var(--ink)]/70">Stages</span>
        <span className="truncate tabular-nums text-[var(--ink)]/70">
          {preinfusion ? ` · Pre-infusion ${preinfusion.seconds.toFixed(1)} s · ${preinfusion.grams.toFixed(1)} g` : ""} · {stages.length} stage{stages.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-[var(--ink)]/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3">
      {preinfusion && (
        <p className="mt-1 text-base tabular-nums">
          Pre-infusion <b>{preinfusion.seconds.toFixed(1)} s</b>
          <span className="text-[var(--ink)]/75"> · {Math.round(preinfusion.share * 100)}% of the shot · {preinfusion.grams.toFixed(1)} g in the cup</span>
        </p>
      )}
      <ol className="mt-2 divide-y divide-[var(--ink)]/12 rounded-md border border-[var(--ink)]/15">
        {stages.map((s, i) => (
          <li key={`${s.name}-${i}`} className="px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-base font-bold">{s.name}</span>
              <span className="text-sm tabular-nums text-[var(--ink)]/80">{s1(s.end - s.start)} s · {s.grams.toFixed(1)} g</span>
            </p>
            <p className="text-sm tabular-nums text-[var(--ink)]/75">
              {s.avgP.toFixed(1)} bar <span className="text-[var(--ink)]/55">(max {s.maxP.toFixed(1)})</span>
              {" · "}{s.avgF.toFixed(1)} ml/s <span className="text-[var(--ink)]/55">(max {s.maxF.toFixed(1)})</span>
            </p>
            <p className={`text-sm font-semibold ${s.ended.kind === "cut" ? "text-[var(--accent)]" : "text-[var(--ink)]/80"}`}>
              {endText(s.ended)}
              {s.onLimit >= 0.25 && (
                <span className="font-normal text-[var(--ink)]/70">
                  {" · "}on its {s.type === "pressure" ? "flow" : "pressure"} limit {Math.round(s.onLimit * 100)}% of the time
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>
      </div>}
    </section>
  );
}
