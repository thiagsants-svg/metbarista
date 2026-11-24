"use client";

/**
 * One coffee at a glance, over its shots: how many, how many liked, the grind
 * now, the plan waiting for the next shot, and every refractometer reading on
 * the brew chart (joined in order, the latest in the accent color).
 */

import { BrewChart } from "@/components/brew-chart";
import { targetFor } from "@/lib/brew-control";
import { loadPlan, planLines, TASTE_LABEL } from "@/lib/next-plan";
import { grindText, type ShotRowData } from "@/components/shots/shot-row";

export function CoffeeOverview({ coffee, rows, faces }: {
  coffee: string;
  /** This coffee's shots, newest first */
  rows: ShotRowData[];
  faces: Record<string, "like" | "dislike" | null>;
}) {
  const real = rows.filter((r) => !r.flush);
  const latest = real[0]?.sum;
  const liked = real.filter((r) => faces[r.id] === "like").length;
  const disliked = real.filter((r) => faces[r.id] === "dislike").length;
  const plan = loadPlan(coffee);
  const lines = plan && latest ? planLines(latest.patch, plan) : [];
  const brews = real.filter((r) => r.sum.tds != null && r.sum.ey != null);
  const [newest, ...older] = brews;
  const eys = brews.map((r) => r.sum.ey!);

  return (
    <section className="rounded-md border border-[var(--ink)]/15 p-3">
      <h2 className="text-xl font-bold">{coffee}</h2>
      <p className="mt-0.5 text-sm tabular-nums text-[var(--ink)]/75">
        {real.length} shot{real.length === 1 ? "" : "s"}
        {liked ? ` · ${liked} liked` : ""}
        {disliked ? ` · ${disliked} disliked` : ""}
        {latest && grindText(latest) ? ` · grind now ${grindText(latest)}` : ""}
        {eys.length > 1 ? ` · EY ${Math.min(...eys).toFixed(1)}–${Math.max(...eys).toFixed(1)}%` : ""}
      </p>

      {plan && (
        <div className="mt-2 rounded-md border-2 border-[var(--accent)] bg-[var(--primary)]/15 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Next shot · {TASTE_LABEL[plan.taste]}
          </p>
          <p className="text-lg font-bold tabular-nums">{lines.length ? lines.join(" · ") : "Same recipe"}</p>
        </div>
      )}

      {newest ? (
        <div className="mt-3">
          <BrewChart shot={{ tds: newest.sum.tds!, ey: newest.sum.ey! }}
            past={older.map((r) => ({ tds: r.sum.tds!, ey: r.sum.ey! }))}
            target={targetFor(newest.sum.patch.ratio)} />
          {older.length > 0 && (
            <p className="text-xs text-[var(--ink)]/60">Big dot: latest reading · open dots: earlier shots, joined in order</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--ink)]/60">No refractometer readings yet for this coffee.</p>
      )}
    </section>
  );
}
