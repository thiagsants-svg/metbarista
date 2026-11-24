"use client";

/**
 * Shots, for how this bar works: each shot with its coffee, grind, TDS / EY,
 * face, taste and the plan decided after it. Pick a coffee to see its story
 * (count, likes, the plan waiting, the brew chart of all its readings).
 * Same look as the Station, light or dark.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Moon, Sun } from "lucide-react";
import { getHistory, getShotRating } from "@/lib/machine-api";
import { useRequireConnection } from "@/lib/connection-store";
import { shotSummary } from "@/lib/coffee-history";
import { analyzeShot } from "@/lib/shot-analysis";
import { getShotNote } from "@/lib/shot-notes";
import { parseShotNote } from "@/lib/shot-record";
import { asciiName } from "@/lib/recipe";
import { useStationTheme } from "@/lib/station/use-theme";
import { ShotRow, type ShotRowData } from "@/components/shots/shot-row";
import { CoffeeOverview } from "@/components/shots/coffee-overview";
import { ShotDetail } from "@/components/shots/shot-detail";
import type { ShotEntry } from "@/lib/types";

type Face = "like" | "dislike";
const PAGE = 30;
const sameCoffee = (a: string, b: string) => asciiName(a).toLowerCase() === asciiName(b).toLowerCase();

function buildRows(shots: ShotEntry[]): ShotRowData[] {
  const rows = shots.map((shot) => {
    const sum = shotSummary(shot);
    return {
      id: shot.id, sum, notes: parseShotNote(getShotNote(shot.time)?.note),
      grindDelta: null as number | null, flush: analyzeShot(shot).throwaway,
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

function ShotsContent() {
  useRequireConnection();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("shot") ?? params.get("id");
  const coffee = params.get("coffee");
  const { theme, style, toggle } = useStationTheme();

  const [limit, setLimit] = useState(PAGE);
  const [shots, setShots] = useState<ShotEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faces, setFaces] = useState<Record<string, Face | null>>({});
  /** Bumped when notes are saved here, to re-read them */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    getHistory(limit)
      .then((h) => { if (alive) { setShots(h); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [limit]);

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

  function go(next: { coffee?: string | null; shot?: string | null }) {
    const c = next.coffee !== undefined ? next.coffee : coffee;
    const s = next.shot !== undefined ? next.shot : selectedId;
    const q = new URLSearchParams();
    if (c) q.set("coffee", c);
    if (s) q.set("shot", s);
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

      {shown.length === 0 ? (
        <p className="py-6 text-base text-[var(--ink)]/70">No shots{coffee ? ` with ${coffee}` : ""} in the last {limit}.</p>
      ) : (
        <ol className="divide-y divide-[var(--ink)]/15 rounded-md border border-[var(--ink)]/15">
          {shown.map((r) => (
            <li key={r.id}>
              <ShotRow row={r} face={faces[r.id]} showCoffee={!coffee} selected={r.id === selectedId}
                onSelect={() => go({ shot: r.id === selectedId ? null : r.id })} />
            </li>
          ))}
        </ol>
      )}

      {shots && shots.length >= limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)}
          className="h-11 w-full rounded-md border border-[var(--ink)]/25 text-sm font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
          Show older shots
        </button>
      )}
    </div>
  );

  return (
    <div style={style} className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="flex-1 text-2xl font-bold">Shots</h1>
          {shots && <span className="text-sm tabular-nums text-[var(--ink)]/60">last {shots.length}</span>}
          <button aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggle}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        {error ? (
          <div className="py-16 text-center">
            <p className="text-base text-[var(--ink)]/75">Couldn&apos;t read the machine&apos;s history: {error}</p>
            <button onClick={() => { setError(null); setShots(null); setLimit((l) => l); getHistory(limit).then(setShots).catch((e) => setError(String(e))); }}
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
              onBack={() => go({ shot: null })} />
          </div>
        ) : list}
      </div>
    </div>
  );
}

export default function ShotsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#ffc400]" /></div>}>
      <ShotsContent />
    </Suspense>
  );
}
