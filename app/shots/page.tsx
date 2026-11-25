"use client";

/**
 * Shots, for how this bar works: each shot with its coffee, grind, TDS / EY,
 * face, taste and the plan decided after it. Pick a coffee to see its story
 * (count, likes, the plan waiting, the brew chart of all its readings).
 * Same look as the Station, light or dark.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getHistory, getHistoryLight, getShotRating, searchHistory } from "@/lib/machine-api";
import { useRequireConnection } from "@/lib/connection-store";
import { shotSummary } from "@/lib/coffee-history";
import { isThrowaway } from "@/lib/throwaway";
import { getShotNote } from "@/lib/shot-notes";
import { parseShotNote } from "@/lib/shot-record";
import { sameCoffee } from "@/lib/recipe";
import { useStationTheme } from "@/lib/station/use-theme";
import { ShotRow, type ShotRowData } from "@/components/shots/shot-row";
import { CoffeeOverview } from "@/components/shots/coffee-overview";
import { ShotDetail } from "@/components/shots/shot-detail";
import type { ShotEntry } from "@/lib/types";

type Face = "like" | "dislike";
const PAGE = 30;

/** Under this in the cup it's a stopped or choked try, not a shot to compare */
const TOO_LITTLE_G = 12;

/** Pressure and weight scaled 0..1 (pressure over 12 bar, weight over the shot's own), ~40 points */
function sparkOf(shot: ShotEntry): ShotRowData["spark"] {
  const f = shot.data ?? [];
  if (f.length < 3) return undefined;
  const step = Math.max(1, Math.ceil(f.length / 40));
  const pick = f.filter((_, i) => i % step === 0 || i === f.length - 1);
  const wMax = Math.max(1, ...pick.map((x) => x.shot?.weight ?? 0));
  return {
    p: pick.map((x) => Math.min(1, Math.max(0, (x.shot?.pressure ?? 0) / 12))),
    w: pick.map((x) => Math.min(1, Math.max(0, (x.shot?.weight ?? 0) / wMax))),
  };
}

function buildRows(shots: ShotEntry[]): ShotRowData[] {
  const rows = shots.map((shot) => {
    const sum = shotSummary(shot);
    const throwaway = isThrowaway(shot);
    const tiny = !throwaway && sum.weight < TOO_LITTLE_G;
    return {
      id: shot.id, sum, notes: parseShotNote(getShotNote(shot.time)?.note),
      grindDelta: null as number | null, flush: throwaway || tiny,
      flushWhy: throwaway ? "flush" : tiny ? `only ${sum.weight.toFixed(1)} g` : undefined,
      spark: sparkOf(shot),
    };
  });
  // Grind change against the same coffee's previous (older) shot
  rows.forEach((r, i) => {
    const g = r.sum.patch.grindUm ?? r.sum.patch.grindSetting;
    if (g == null || !r.sum.coffee || r.flush) return;
    const prev = rows.slice(i + 1).find((o) => !o.flush && o.sum.coffee && sameCoffee(o.sum.coffee, r.sum.coffee));
    const pg = prev ? prev.sum.patch.grindUm ?? prev.sum.patch.grindSetting : undefined;
    if (pg != null) r.grindDelta = Math.round((g - pg) * 10) / 10;
  });
  return rows;
}

/** Rows grouped by day, newest first: "Today", "Yesterday", then "Mon, Nov 24" */
function byDay(rows: ShotRowData[]): [string, ShotRowData[]][] {
  const out: [string, ShotRowData[]][] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const r of rows) {
    const d = new Date(r.sum.when); d.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    const label = days === 0 ? "Today" : days === 1 ? "Yesterday"
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(r);
    else out.push([label, [r]]);
  }
  return out;
}

function ShotsContent() {
  useRequireConnection();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("shot") ?? params.get("id");
  const coffee = params.get("coffee");
  /** The shot the open one is compared with */
  const vs = params.get("vs");
  const { style } = useStationTheme();

  const [limit, setLimit] = useState(PAGE);
  const [shots, setShots] = useState<ShotEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<Record<string, Face | null>>({});
  /** Bumped when notes are saved here, to re-read them */
  const [version, setVersion] = useState(0);

  // The newest page once; older pages are added by "Show older shots"
  useEffect(() => {
    let alive = true;
    getHistory(PAGE)
      .then((h) => { if (alive) { setShots(h); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  /**
   * The next older page only: the light list says which shots come next, then one
   * search reads just their curves (the shots already on screen aren't read again)
   */
  const [loadingOlder, setLoadingOlder] = useState(false);
  async function loadOlder() {
    if (!shots?.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const have = new Set(shots.map((s) => s.id));
      const next = (await getHistoryLight(shots.length + PAGE)).filter((s) => !have.has(s.id)).slice(0, PAGE);
      if (next.length) {
        const from = Math.min(...next.map((s) => s.time)) - 1;
        const to = Math.max(...next.map((s) => s.time)) + 1;
        const got = (await searchHistory(from, to, PAGE + 10)).filter((s) => !have.has(s.id));
        setShots((cur) => [...(cur ?? []), ...got].sort((a, b) => b.time - a.time));
      }
      setLimit((l) => l + PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoadingOlder(false);
  }

  // version re-reads this device's notes after an edit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (shots ? buildRows(shots) : []), [shots, version]);

  /** Coffees, most recently brewed first */
  const coffees = useMemo(() => {
    const out: { name: string; count: number }[] = [];
    for (const r of rows) {
      if (!r.sum.coffee || r.flush) continue;
      const hit = out.find((c) => sameCoffee(c.name, r.sum.coffee));
      if (hit) hit.count++;
      else out.push({ name: r.sum.coffee, count: 1 });
    }
    return out;
  }, [rows]);

  const shown = useMemo(
    () => (coffee ? rows.filter((r) => r.sum.coffee && sameCoffee(r.sum.coffee, coffee)) : rows),
    [rows, coffee]);

  // Faces live on the machine: read them for the shots on screen
  useEffect(() => {
    const missing = shown.map((r) => r.id).filter((id) => !(id in faces));
    if (missing.length === 0) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < missing.length && alive; i += 6) {
        const batch = missing.slice(i, i + 6);
        const got = await Promise.all(batch.map((id) => getShotRating(id).catch(() => null)));
        if (alive) setFaces((cur) => ({ ...cur, ...Object.fromEntries(batch.map((id, k) => [id, got[k]])) }));
      }
    })();
    return () => { alive = false; };
  }, [shown, faces]);

  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;
  const selectedShot = selected ? shots?.find((s) => s.id === selected.id) ?? null : null;

  function go(next: { coffee?: string | null; shot?: string | null; vs?: string | null }) {
    const c = next.coffee !== undefined ? next.coffee : coffee;
    const s = next.shot !== undefined ? next.shot : selectedId;
    // Opening another shot stops the comparison
    const v = next.vs !== undefined ? next.vs : next.shot !== undefined ? null : vs;
    const q = new URLSearchParams();
    if (c) q.set("coffee", c);
    if (s) q.set("shot", s);
    if (s && v) q.set("vs", v);
    const qs = q.toString();
    router.push(qs ? `/shots?${qs}` : "/shots", { scroll: false });
  }

  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-4 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  const list = (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Coffee">
        <button type="button" role="tab" aria-selected={!coffee} onClick={() => go({ coffee: null, shot: null })} className={chip(!coffee)}>
          All coffees
        </button>
        {coffees.map((c) => (
          <button key={c.name} type="button" role="tab" aria-selected={!!coffee && sameCoffee(coffee, c.name)}
            onClick={() => go({ coffee: c.name, shot: null })} className={chip(!!coffee && sameCoffee(coffee, c.name))}>
            {c.name} <span className="ml-1 font-normal opacity-70">{c.count}</span>
          </button>
        ))}
      </div>

      {coffee && <CoffeeOverview coffee={coffees.find((c) => sameCoffee(c.name, coffee))?.name ?? coffee} rows={shown} faces={faces} />}

      {shown.some((r) => r.grindDelta) && (
        <p className="text-xs text-[var(--ink)]/65">
          <b className="text-[var(--accent)]">−10 µm</b> / <b className="text-[var(--accent)]">+5 µm</b>: the grind against the same coffee&apos;s shot before (finer / coarser).
          The small curve: pressure, and the cup filling.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-6 text-base text-[var(--ink)]/70">No shots{coffee ? ` with ${coffee}` : ""} in the last {limit}.</p>
      ) : (
        <div className="space-y-3">
          {byDay(shown).map(([day, list]) => (
            <section key={day}>
              <h3 className="sticky top-0 z-[1] bg-[var(--paper)] py-1 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
                {day} <span className="font-normal">· {list.length} shot{list.length === 1 ? "" : "s"}</span>
              </h3>
              <ol className="divide-y divide-[var(--ink)]/15 rounded-md border border-[var(--ink)]/15">
                {list.map((r) => (
                  <li key={r.id}>
                    <ShotRow row={r} face={faces[r.id]} showCoffee={!coffee} selected={r.id === selectedId} timeOnly
                      onSelect={() => go({ shot: r.id === selectedId ? null : r.id })} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {shots && shots.length >= limit && (
        <button type="button" onClick={loadOlder} disabled={loadingOlder}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--ink)]/25 text-sm font-semibold text-[var(--ink)]/80 active:scale-[0.98] disabled:opacity-60">
          {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />} Show older shots
        </button>
      )}
    </div>
  );

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1">

        {error ? (
          <div className="py-16 text-center">
            <p className="text-base text-[var(--ink)]/75">Couldn&apos;t read the machine&apos;s history: {error}</p>
            <button onClick={() => { setError(null); setShots(null); setLimit((l) => l); getHistory(PAGE).then(setShots).catch((e) => setError(String(e))); }}
              className="mt-4 h-11 rounded-md border border-[var(--ink)]/25 px-5 text-sm font-semibold">Try again</button>
          </div>
        ) : !shots ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" /></div>
        ) : selected && selectedShot ? (
          // A shot open: side by side on wide screens, the shot alone on a tablet in portrait
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
            <div className="hidden lg:block">{list}</div>
            <ShotDetail shot={selectedShot} row={selected} face={faces[selected.id]}
              pastBrews={rows
                .slice(rows.indexOf(selected) + 1)
                .filter((r) => !r.flush && r.sum.coffee && selected.sum.coffee && sameCoffee(r.sum.coffee, selected.sum.coffee)
                  && r.sum.tds != null && r.sum.ey != null)
                .map((r) => ({ tds: r.sum.tds!, ey: r.sum.ey! }))}
              onFace={(f) => setFaces((cur) => ({ ...cur, [selected.id]: f }))}
              onSaved={() => setVersion((v) => v + 1)}
              onBack={() => go({ shot: null })}
              others={rows.filter((r) => r.id !== selected.id).flatMap((r) => {
                const sh = shots.find((x) => x.id === r.id);
                return sh ? [{ row: r, shot: sh }] : [];
              })}
              compareId={vs}
              onCompare={(id) => go({ vs: id })} />
          </div>
        ) : list}
      </div>
    </div>
  );
}

export default function ShotsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#ffc400]" /></div>}>
      <ShotsContent />
    </Suspense>
  );
}
