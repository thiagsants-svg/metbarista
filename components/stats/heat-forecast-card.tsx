"use client";

/**
 * Heating forecast vs reality: how far off the Station's "about N min" was,
 * for the water and for the Bar down, from the heatings logged on this device
 * (lib/heat-log.ts). Read only.
 */

import { useSyncExternalStore } from "react";
import { heatErrors, loadHeatRuns, waterKind, type HeatRun } from "@/lib/heat-log";

const noop = () => () => {};
let cache: { raw: string | null; runs: HeatRun[] } = { raw: null, runs: [] };
function snapshot(): HeatRun[] {
  const raw = localStorage.getItem("metbarista_heat_log");
  if (raw !== cache.raw) cache = { raw, runs: loadHeatRuns() };
  return cache.runs;
}
const none: HeatRun[] = [];

const clock = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.round(Math.abs(s) % 60)).padStart(2, "0")}`;
const signed = (s: number) => (Math.abs(s) < 15 ? "on time" : s > 0 ? `${clock(s)} late` : `${clock(s)} early`);

export function HeatForecastCard() {
  const runs = useSyncExternalStore(noop, snapshot, () => none);
  const recent = runs.slice(-8).reverse();
  // Hot water from the kettle and cold tap water heat very differently: scored apart (worked out from the dip, nothing to tap)
  const kinds = (["cold", "hot", "unknown"] as const).filter((k) => runs.some((r) => waterKind(r) === k));
  const kindLabel = { cold: "Cold water poured in", hot: "Hot water poured in", unknown: "Water step not seen" };
  const tables = [
    { key: "water" as const, title: "Water" },
    { key: "barDown" as const, title: "Bar down (within 2 °C)" },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Heating forecast vs reality</h2>
      <p className="mt-1 text-sm text-[var(--ink)]/70">
        While heating, the Station says how long is left. Every heating is logged on this tablet: what it said every 30 s,
        and when it really got there, with the whole curve, the machine&apos;s voltage and how warm it already was, so the
        forecast can learn from them. &ldquo;Late&rdquo; means it said later than it was; &ldquo;early&rdquo;, sooner (too optimistic).
      </p>
      {!runs.length ? (
        <p className="mt-2 text-base text-[var(--ink)]/75">No heatings logged yet: heat the machine from the Station and they show up here.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {kinds.flatMap((kind) => tables.map((tb) => ({ ...tb, kind }))).map((tb) => (
              <div key={`${tb.kind}-${tb.key}`}>
                <p className="text-base font-semibold">{tb.title}{kinds.length > 1 && <span className="font-normal text-[var(--ink)]/70"> · {kindLabel[tb.kind]}</span>}</p>
                <table className="mt-1 w-full text-sm">
                  <thead><tr className="text-left text-[var(--ink)]/70"><th className="font-medium">Said when</th><th className="font-medium">Average</th><th className="font-medium">Worst</th><th className="font-medium text-right">n</th></tr></thead>
                  <tbody>
                    {heatErrors(runs, tb.key, kinds.length > 1 ? tb.kind : undefined).map((r) => (
                      <tr key={r.label} className="border-t border-[var(--ink)]/10">
                        <td className="py-1">{r.label}</td>
                        <td className="tabular-nums">{r.avg == null ? "—" : signed(r.avg)}</td>
                        <td className="tabular-nums">{r.worst == null ? "—" : signed(r.worst)}</td>
                        <td className="text-right tabular-nums">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="mt-4 text-base font-semibold">Last heatings</p>
          <ul className="mt-1 space-y-1 text-sm">
            {recent.map((r) => {
              const first = (g: HeatRun["water"]) => g.guesses[0];
              const w = first(r.water), b = first(r.barDown);
              return (
                <li key={r.start} className="border-t border-[var(--ink)]/10 pt-1">
                  <span className="font-medium">{new Date(r.start).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {" · "}{r.startTemp.toFixed(0)} → {r.target} °C
                  {r.voltage ? ` · ${r.voltage} V` : ""}
                  {r.startBarDown != null ? ` · group at ${r.startBarDown.toFixed(0)} °C` : ""}
                  {r.sincePrevMin != null && r.sincePrevMin < 24 * 60 ? ` · ${r.sincePrevMin} min after the last heating` : ""}
                  {r.machineReadyAt != null && <> · machine said ready in {clock(r.machineReadyAt)}</>}
                  {r.water.kind && <> · {r.water.kind} water in at {clock(r.water.addedAt ?? 0)} (tube {r.water.tubeBefore?.toFixed(0)} → {r.water.tubeMinAfter?.toFixed(0)} °C)</>}
                  {r.water.readyAt != null && <> · water in {clock(r.water.readyAt)}{w ? ` (first said ${clock(w.at)})` : ""}</>}
                  {r.barDown.readyAt != null && <> · Bar down {r.barDown.how === "settled" ? "settled" : "ready"} in {clock(r.barDown.readyAt)}{b ? ` (first said ${clock(b.at)})` : ""}</>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
