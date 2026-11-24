"use client";

/**
 * Stats about the coffee: how many shots and how much coffee went through,
 * what you liked, where extraction landed, the taste you noted, and each
 * coffee's story with the recipe of its last liked shot. No scores, levels or
 * badges. Reads the machine's history without the curves, so it's quick.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Snowflake } from "lucide-react";
import { getHistoryLight, getShotRating } from "@/lib/machine-api";
import { useRequireConnection } from "@/lib/connection-store";
import { shotSummary } from "@/lib/coffee-history";
import { getShotNote } from "@/lib/shot-notes";
import { parseShotNote } from "@/lib/shot-record";
import { computeStats, type ShotLite } from "@/lib/stats";
import { listCoffees, type Coffee } from "@/lib/coffees";
import { TASTE_LABEL, type Taste } from "@/lib/next-plan";
import { formatRatio } from "@/lib/recipe";
import { useStationTheme } from "@/lib/station/use-theme";
import type { ShotEntry } from "@/lib/types";

type Face = "like" | "dislike" | null;
const DAY = 86_400_000;
const PERIODS = [
  { key: "7", label: "7 days", days: 7, by: "day" },
  { key: "30", label: "30 days", days: 30, by: "day" },
  { key: "90", label: "90 days", days: 90, by: "week" },
  { key: "all", label: "All", days: 0, by: "week" },
] as const;

function toLite(shot: ShotEntry, face: Face | undefined): ShotLite {
  const s = shotSummary(shot);
  const n = parseShotNote(getShotNote(shot.time)?.note);
  const p = s.patch;
  return {
    id: shot.id, at: s.when, coffee: s.coffee, profile: s.profileName,
    dose: p.dose, ratio: p.ratio, temperature: p.temperature,
    grind: p.grindUm != null ? `${p.grindUm} µm` : p.grindSetting != null ? `grind ${p.grindSetting}` : undefined,
    taste: n.taste, tds: n.tds, ey: n.ey, face,
  };
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function StatsPage() {
  useRequireConnection();
  const { style } = useStationTheme();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[1]);
  const [history, setHistory] = useState<ShotEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<Record<string, Face>>({});
  const [shelf] = useState<Coffee[]>(() => (typeof window === "undefined" ? [] : listCoffees()));
  const [now] = useState(() => Date.now());

  useEffect(() => {
    getHistoryLight(1000).then(setHistory).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const from = period.days ? now - period.days * DAY : Math.min(now, ...(history ?? []).map((h) => h.time * 1000));
  const inPeriod = useMemo(() => (history ?? []).filter((h) => h.time * 1000 >= from), [history, from]);

  // Likes live on the machine: read them for the shots in the period
  useEffect(() => {
    const missing = inPeriod.map((h) => h.id).filter((id) => !(id in faces));
    if (!missing.length) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < missing.length && alive; i += 8) {
        const batch = missing.slice(i, i + 8);
        const got = await Promise.all(batch.map((id) => getShotRating(id).catch(() => null)));
        if (alive) setFaces((cur) => ({ ...cur, ...Object.fromEntries(batch.map((id, k) => [id, got[k]])) }));
      }
    })();
    return () => { alive = false; };
  }, [inPeriod, faces]);

  const stats = useMemo(
    () => computeStats(inPeriod.map((h) => toLite(h, faces[h.id])), from, now, period.by),
    [inPeriod, faces, from, now, period.by]);

  const frozenDoses = shelf.filter((c) => c.status === "frozen" && c.freezeMode === "doses");
  const frozenBags = shelf.filter((c) => c.status === "frozen" && c.freezeMode === "bag");
  const dosesLeft = frozenDoses.reduce((n, c) => n + (c.doses ?? 0), 0);
  const maxBar = Math.max(1, ...stats.buckets.map((b) => b.shots));
  const tasteTotal = Math.max(1, stats.taste.sour + stats.taste.balanced + stats.taste.bitter);

  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-4 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="min-w-0 border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs tabular-nums text-[var(--ink)]/65">{sub}</p>}
    </div>
  );
  const section = "mt-6 text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70";

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={period.key === p.key} onClick={() => setPeriod(p)} className={chip(period.key === p.key)}>
              {p.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="py-16 text-center text-base text-[var(--ink)]/75">Couldn&apos;t read the machine&apos;s history: {error}</p>
        ) : !history ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" /></div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {tile("Shots", String(stats.shots))}
              {tile("Coffee used", `${Math.round(stats.grams)} g`, stats.dosed < stats.shots
                ? `from the ${stats.dosed} shots with a dose (Station)`
                : stats.grams >= 250 ? `≈ ${(stats.grams / 250).toFixed(1)} bags of 250 g` : undefined)}
              {tile("Liked", stats.rated ? `${Math.round((stats.liked / stats.rated) * 100)}%` : "—",
                stats.rated ? `${stats.liked} of ${stats.rated} rated` : "no shots rated")}
              {tile("Average EY", stats.ey ? `${stats.ey.avg.toFixed(1)}%` : "—",
                stats.ey ? `${stats.ey.n} reading${stats.ey.n === 1 ? "" : "s"}` : "no TDS readings")}
            </div>

            {/* Shots per day (or week) */}
            <p className={section}>Shots per {period.by}</p>
            <div className="mt-2 flex h-36 items-end gap-[2px] border-b border-[var(--ink)]/25">
              {stats.buckets.map((b) => (
                <div key={b.start} className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${fmtDay(b.start)}: ${b.shots} shot${b.shots === 1 ? "" : "s"}, ${Math.round(b.grams)} g`}>
                  {b.shots > 0 && <span className="text-center text-[10px] tabular-nums text-[var(--ink)]/70">{b.shots}</span>}
                  <div className="rounded-t-sm bg-[var(--primary)]" style={{ height: `${(b.shots / maxBar) * 85}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs tabular-nums text-[var(--ink)]/60">
              <span>{stats.buckets[0] ? fmtDay(stats.buckets[0].start) : ""}</span>
              <span>{fmtDay(now)}</span>
            </div>

            {/* Taste noted after the shots */}
            <p className={section}>Taste</p>
            {stats.taste.sour + stats.taste.balanced + stats.taste.bitter === 0 ? (
              <p className="mt-1 text-sm text-[var(--ink)]/70">No taste noted in this period.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {(["sour", "balanced", "bitter"] as Taste[]).map((t) => (
                  <div key={t} className="flex items-center gap-3">
                    <span className="w-20 text-sm font-semibold">{TASTE_LABEL[t]}</span>
                    <div className="h-4 flex-1 rounded-sm bg-[var(--ink)]/[0.07]">
                      <div className="h-full rounded-sm bg-[var(--ink)]/70" style={{ width: `${(stats.taste[t] / tasteTotal) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-sm tabular-nums">{stats.taste[t]}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Each coffee */}
            <p className={section}>Coffees</p>
            {stats.coffees.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--ink)]/70">No shots with a coffee picked in this period.</p>
            ) : (
              <ol className="mt-2 divide-y divide-[var(--ink)]/15 rounded-md border border-[var(--ink)]/15">
                {stats.coffees.map((c) => {
                  const onShelf = shelf.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
                  return (
                    <li key={c.name}>
                      <Link href={`/shots?coffee=${encodeURIComponent(c.name)}`} className="block px-3 py-2.5 active:bg-[var(--ink)]/[0.05]">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <span className="text-lg font-bold">{c.name}</span>
                          {onShelf?.status === "frozen" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink)]/70">
                              <Snowflake className="h-3.5 w-3.5" />
                              {onShelf.freezeMode === "bag" ? "frozen bag" : onShelf.doses != null ? `${onShelf.doses} doses left` : "frozen"}
                            </span>
                          )}
                          {onShelf?.status === "finished" && <span className="text-xs font-semibold text-[var(--ink)]/60">finished</span>}
                        </div>
                        <p className="text-sm tabular-nums text-[var(--ink)]/80">
                          {c.shots} shot{c.shots === 1 ? "" : "s"} · {Math.round(c.grams)} g
                          {c.liked ? ` · ${c.liked} liked` : ""}{c.disliked ? ` · ${c.disliked} disliked` : ""}
                          {c.ey ? ` · EY ${c.ey.n > 1 ? `${c.ey.min.toFixed(1)}–${c.ey.max.toFixed(1)}` : c.ey.avg.toFixed(1)}%` : ""}
                          {c.lastGrind ? ` · grind now ${c.lastGrind}` : ""}
                        </p>
                        {c.best && (
                          <p className="text-sm tabular-nums text-[var(--accent)]">
                            Last liked ({fmtDay(c.best.at)}): {[
                              c.best.dose != null ? `${c.best.dose} g` : null,
                              c.best.ratio != null ? formatRatio(c.best.ratio) : null,
                              c.best.temperature != null ? `${c.best.temperature} °C` : null,
                              c.best.grind ?? null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* The freezer, from the Coffees page */}
            {(frozenDoses.length > 0 || frozenBags.length > 0) && (
              <>
                <p className={section}>Freezer</p>
                <p className="mt-1 text-base">
                  {frozenDoses.length > 0 && <><b className="tabular-nums">{dosesLeft}</b> single dose{dosesLeft === 1 ? "" : "s"} of {frozenDoses.length} coffee{frozenDoses.length === 1 ? "" : "s"}</>}
                  {frozenDoses.length > 0 && frozenBags.length > 0 && " · "}
                  {frozenBags.length > 0 && <><b className="tabular-nums">{frozenBags.length}</b> whole bag{frozenBags.length === 1 ? "" : "s"}</>}
                </p>
              </>
            )}

            {/* Profiles */}
            {stats.profiles.length > 0 && (
              <>
                <p className={section}>Profiles</p>
                <ol className="mt-1 space-y-0.5">
                  {stats.profiles.slice(0, 6).map((p) => (
                    <li key={p.name} className="flex justify-between text-base">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-[var(--ink)]/75">{p.count}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
