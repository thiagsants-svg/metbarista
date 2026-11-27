"use client";

/**
 * Water recipes (GH, KH, TDS, calcium, magnesium, pH) and which one is in use.
 * Every shot and pour-over is tagged with the water in use when it was made,
 * so the AI review can tell batches apart. See lib/water.ts.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  currentWaterId, loadWaters, saveWaters, SCA_WATER, setCurrentWater, waterAdvice, waterText, type WaterRecipe,
} from "@/lib/water";

const input = "w-full min-h-11 rounded-md border border-[var(--ink)]/25 bg-transparent px-3 py-2 text-base";
const btn = "min-h-11 rounded-lg px-4 py-2 text-base font-semibold active:scale-[0.97] disabled:opacity-40";

export default function WaterPage() {
  const [list, setList] = useState<WaterRecipe[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    // This browser's own list, after the first render
    setList(loadWaters()); // eslint-disable-line react-hooks/set-state-in-effect
    setCurrent(currentWaterId());
  }, []);

  const change = (next: WaterRecipe[]) => { setList(next); saveWaters(next); };
  const edit = (id: string, p: Partial<WaterRecipe>) => change(list.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const use = (id: string | null) => { setCurrentWater(id); setCurrent(id); };
  const add = () => {
    const w: WaterRecipe = { id: crypto.randomUUID(), name: "My water" };
    change([...list, w]); setEditing(w.id);
  };
  const num = (v: string) => { const n = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(n) ? n : undefined; };
  const field = (w: WaterRecipe, key: "gh" | "kh" | "tds" | "ca" | "mg" | "ph", label: string, hint: string) => (
    <label className="grid gap-1 text-sm">
      <span>{label} <span className="text-[var(--ink)]/60">{hint}</span></span>
      <input className={input} inputMode="decimal" value={w[key] ?? ""} onChange={(e) => edit(w.id, { [key]: num(e.target.value) })} />
    </label>
  );

  return (
    <div className="grid gap-4 pt-1 sm:max-w-2xl">
      <p className="text-base text-[var(--ink)]/75">
        What&apos;s in the water moves extraction as much as a grind step. Pick the water you&apos;re using: every shot and
        pour-over from now on is tagged with it, so you and the AI review can see which water each one was made with.
      </p>

      <section className="rounded-lg border border-[var(--ink)]/15 p-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">In use now</p>
        <p className="mt-1 text-lg font-bold">{waterText(list.find((w) => w.id === current) ?? null) || "Not set"}</p>
        {current && <button className={`${btn} mt-2 border border-[var(--ink)]/25`} onClick={() => use(null)}>Stop tagging a water</button>}
      </section>

      {list.map((w) => (
        <section key={w.id} className={`rounded-lg border p-3 ${w.id === current ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--ink)]/15"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button className="min-h-11 flex-1 text-left" aria-expanded={editing === w.id} onClick={() => setEditing(editing === w.id ? null : w.id)}>
              <p className="font-semibold">{waterText(w)}</p>
              {w.source && <p className="text-sm text-[var(--ink)]/70">{w.source}</p>}
            </button>
            {w.id !== current && <button className={`${btn} bg-[var(--primary)] text-[var(--on-primary)]`} onClick={() => use(w.id)}>Use this water</button>}
          </div>
          {waterAdvice(w).map((a) => <p key={a} className="mt-1 text-sm text-[var(--warn)]">{a}</p>)}
          {editing === w.id && (
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">Name<input className={input} value={w.name} onChange={(e) => edit(w.id, { name: e.target.value })} /></label>
                <label className="grid gap-1 text-sm">Source<input className={input} value={w.source ?? ""} placeholder="filtered tap, RO + minerals, bottled…" onChange={(e) => edit(w.id, { source: e.target.value })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {field(w, "gh", "GH", "ppm CaCO3")}
                {field(w, "kh", "KH (alkalinity)", "ppm CaCO3")}
                {field(w, "tds", "TDS", "ppm")}
                {field(w, "ca", "Calcium", "mg/L")}
                {field(w, "mg", "Magnesium", "mg/L")}
                {field(w, "ph", "pH", "")}
              </div>
              <label className="grid gap-1 text-sm">Notes<textarea className={input} rows={2} value={w.notes ?? ""} onChange={(e) => edit(w.id, { notes: e.target.value })} /></label>
              <button className={`${btn} w-fit border border-[var(--ink)]/25 text-[var(--bad)]`}
                onClick={() => { if (window.confirm(`Delete "${w.name}"? Shots tagged with it keep the tag but lose its numbers.`)) { change(list.filter((x) => x.id !== w.id)); if (current === w.id) use(null); } }}>
                <span className="inline-flex items-center gap-1.5"><Trash2 className="h-4 w-4" />Delete</span>
              </button>
            </div>
          )}
        </section>
      ))}

      <button className={`${btn} w-fit bg-[var(--primary)] text-[var(--on-primary)]`} onClick={add}>
        <span className="inline-flex items-center gap-1.5"><Plus className="h-4 w-4" />New water</span>
      </button>

      <section className="rounded-lg bg-[var(--ink)]/[0.05] p-3 text-sm">
        <p className="font-semibold">SCA water standard for brewing</p>
        <p className="mt-1">Hardness (GH) about {SCA_WATER.hardness.target} ppm (fine from {SCA_WATER.hardness.range[0]} to {SCA_WATER.hardness.range[1]}) ·
          alkalinity (KH) about {SCA_WATER.alkalinity.target} ppm ({SCA_WATER.alkalinity.range[0]}–{SCA_WATER.alkalinity.range[1]}) ·
          TDS about {SCA_WATER.tds.target} ppm ({SCA_WATER.tds.range[0]}–{SCA_WATER.tds.range[1]}) · pH {SCA_WATER.ph.target} ({SCA_WATER.ph.range[0]}–{SCA_WATER.ph.range[1]}).</p>
        <p className="mt-1 text-[var(--ink)]/70">Magnesium tends to bring out brighter, fruitier notes; calcium a rounder body.</p>
      </section>
    </div>
  );
}
