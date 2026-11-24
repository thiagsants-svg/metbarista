"use client";

/**
 * The shot facts (lib/shot-facts.ts) as a short list: what happened, when, and
 * what it usually means for the next shot.
 */

import { AlertTriangle } from "lucide-react";
import { FACT_LABEL, FACT_TIP, type ShotFact } from "@/lib/shot-facts";

export function ShotFactsList({ facts, quietWhenEmpty = false }: {
  facts: ShotFact[];
  /** Show nothing (instead of "nothing unusual") when there are no facts */
  quietWhenEmpty?: boolean;
}) {
  if (facts.length === 0) {
    return quietWhenEmpty ? null : (
      <p className="text-sm text-[var(--ink)]/70">Nothing unusual in the curves: no channeling, choking or limits hit.</p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="What the curves show">
      {facts.map((f, i) => (
        <li key={`${f.kind}-${i}`} className="rounded-md border-l-4 border-[var(--accent)] bg-[var(--ink)]/[0.04] px-3 py-2">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <AlertTriangle className="h-4 w-4 self-center text-[var(--accent)]" aria-hidden />
            <span className="text-base font-bold">{FACT_LABEL[f.kind]}</span>
            <span className="text-sm tabular-nums text-[var(--ink)]/70">
              {f.stage ? `${f.stage} · ` : ""}{Math.round(f.at / 1000)} s
            </span>
          </p>
          <p className="text-sm tabular-nums text-[var(--ink)]/85">{f.detail}</p>
          <p className="text-sm font-semibold text-[var(--accent)]">{FACT_TIP[f.kind]}</p>
        </li>
      ))}
    </ul>
  );
}
