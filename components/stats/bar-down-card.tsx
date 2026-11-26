"use client";

/**
 * Bar down at the start vs the result: does waiting for the group's lowest
 * thermometer to reach the target give better shots? Shots of the period are
 * grouped by how far below the target the Bar down was when the shot started,
 * with how many you liked and their extraction yield (when measured).
 * Read only: the values come from the shots' own samples (lib/bar-down.ts).
 */

import { useMemo } from "react";
import { byGap, READY_MARGIN, rememberedBarDown } from "@/lib/bar-down";

export function BarDownCard({ shots, tick }: {
  shots: { id: string; coffee?: string; face?: "like" | "dislike" | null; ey?: number | null }[];
  /** Changes while the shots are being read, so the card fills in */
  tick: number;
}) {
  const groups = useMemo(() => {
    void tick;
    const known = new Map(rememberedBarDown().map((b) => [b.id, b]));
    // Each coffee's usual extraction, so a new bag (often the cold first shots) doesn't pass for the group's fault
    const byCoffee = new Map<string, number[]>();
    for (const s of shots) if (s.ey != null) byCoffee.set(s.coffee ?? "", [...(byCoffee.get(s.coffee ?? "") ?? []), s.ey]);
    const usual = (c: string) => { const xs = [...(byCoffee.get(c) ?? [])].sort((a, b) => a - b); return xs.length >= 2 ? xs[Math.floor(xs.length / 2)] : null; };
    const rows = shots.flatMap((s) => {
      const b = known.get(s.id);
      const u = usual(s.coffee ?? "");
      return b ? [{ gap: b.target - b.barDown, face: s.face ?? null, ey: s.ey != null && u != null ? s.ey - u : null }] : [];
    });
    return { rows: rows.length, groups: byGap(rows) };
  }, [shots, tick]);

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Group temperature at the start (Bar down)</h2>
      <p className="mt-1 text-sm text-[var(--ink)]/70">
        Bar down is the group&apos;s lowest thermometer, by the puck: how far below the target it was when each shot started.
        Your hypothesis: waiting until it&apos;s within {READY_MARGIN} °C gives better shots. Read from the shots the machine keeps.
      </p>
      {groups.rows === 0 ? (
        <p className="mt-3 text-sm text-[var(--ink)]/65">No shot read yet: it fills in while the piston card reads the machine&apos;s shots.</p>
      ) : (
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-[var(--ink)]/60">
              <th className="py-1 font-medium">Bar down</th>
              <th className="py-1 text-right font-medium">Shots</th>
              <th className="py-1 text-right font-medium">Liked</th>
              <th className="py-1 text-right font-medium">Extraction vs the coffee&apos;s usual</th>
            </tr>
          </thead>
          <tbody>
            {groups.groups.map((g) => (
              <tr key={g.label} className="border-t border-[var(--ink)]/10">
                <td className="py-1.5">{g.label}</td>
                <td className="py-1.5 text-right">{g.shots}</td>
                <td className="py-1.5 text-right">{g.rated ? `${Math.round((g.liked / g.rated) * 100)}% of ${g.rated}` : "—"}</td>
                <td className="py-1.5 text-right">{g.eys.length ? `${avg(g.eys) >= 0 ? "+" : "−"}${Math.abs(avg(g.eys)).toFixed(1)} (${g.eys.length})` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-sm text-[var(--ink)]/65">
        The first shots of a session or of a new bag are often both colder and less dialled in, so this table alone can mislead.
        To settle it: same coffee and recipe, alternate waiting and not waiting for 4–6 pairs, and measure each with the refractometer.
      </p>
    </section>
  );
}
