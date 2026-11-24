"use client";

/**
 * Stage by stage (lib/stage-summary.ts): each stage's time, grams, pressure
 * and flow, and how it ended; the pre-infusion as a whole on top.
 */

import { endText, type StageSummary } from "@/lib/stage-summary";

const s1 = (ms: number) => (ms / 1000).toFixed(1);

export function StageTable({ summary }: { summary: StageSummary }) {
  const { stages, preinfusion } = summary;
  if (!stages.length) return null;
  return (
    <section aria-labelledby="stages-title">
      <p id="stages-title" className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Stage by stage</p>
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
    </section>
  );
}
