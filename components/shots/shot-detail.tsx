"use client";

/**
 * One shot: the recipe it was made with, what came out, its curve, what was
 * decided after it, and your notes on it (face, taste, TDS, text), editable
 * here too: a TDS measured later, a face forgotten after the shot.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Frown, Loader2, Smile } from "lucide-react";
import { ShotPlot } from "@/components/estacao-charts";
import { BrewChart, type BrewPoint } from "@/components/brew-chart";
import { targetFor } from "@/lib/brew-control";
import { fmtClock, grindText, type ShotRowData } from "@/components/shots/shot-row";
import { shotPoints } from "@/lib/coffee-history";
import { rateShot } from "@/lib/machine-api";
import { getShotNote, getShotPlan, saveShotNote } from "@/lib/shot-notes";
import { composeShotNote } from "@/lib/shot-record";
import { planLines, TASTE_LABEL, type Taste } from "@/lib/next-plan";
import { extractionYield, formatRatio } from "@/lib/recipe";
import type { ShotEntry } from "@/lib/types";

type Face = "like" | "dislike";

export function ShotDetail({ shot, row, pastBrews, face, onFace, onSaved, onBack }: {
  shot: ShotEntry;
  row: ShotRowData;
  /** Earlier readings of the same coffee (newest first), for the brew chart */
  pastBrews: BrewPoint[];
  face: Face | null | undefined;
  /** The face changed on the machine */
  onFace: (face: Face | null) => void;
  /** Notes saved on this device */
  onSaved: () => void;
  onBack: () => void;
}) {
  const s = row.sum;
  const p = s.patch;
  const when = new Date(s.when);
  const plan = getShotPlan(shot.time);
  const planText = plan ? planLines(p, plan) : [];
  const points = shotPoints(shot);
  const actualRatio = p.dose ? s.weight / p.dose : null;

  const tile = (label: string, value: string, sub?: string | null) => (
    <div className="min-w-0 border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="truncate text-2xl font-extrabold tabular-nums leading-tight">{value}</p>
      {sub && <p className="truncate text-xs tabular-nums text-[var(--ink)]/65">{sub}</p>}
    </div>
  );

  return (
    <article className="space-y-5">
      <header className="flex items-start gap-3">
        <button type="button" onClick={onBack} aria-label="All shots"
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95 lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold">{s.coffee || "No coffee"}</h2>
          <p className="text-sm tabular-nums text-[var(--ink)]/70">
            {when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
            {" · "}{s.profileName}
            {row.flush ? " · flush" : ""}
          </p>
        </div>
      </header>

      {/* Recipe, then what came out */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("Dose", p.dose != null ? `${p.dose} g` : "—")}
        {tile("Ratio", p.ratio != null ? formatRatio(p.ratio) : "—", actualRatio ? `came out 1:${actualRatio.toFixed(2)}` : null)}
        {tile("Temp", p.temperature != null ? `${p.temperature} °C` : "—")}
        {tile("Grind", grindText(s) ?? "—",
          [p.feed != null ? `feed ${p.feed}` : null, p.rpm != null ? `${p.rpm} rpm` : null, p.grinder ?? null].filter(Boolean).join(" · ") || null)}
        {tile("In the cup", `${s.weight.toFixed(1)} g`)}
        {tile("Time", fmtClock(s.seconds))}
        {tile("TDS", s.tds != null ? `${s.tds.toFixed(2)}%` : "—")}
        {tile("EY", s.ey != null ? `${s.ey.toFixed(1)}%` : "—")}
      </div>

      {points.length > 1 && (
        <div className="relative h-64">
          <ShotPlot data={points} targetWeight={null} currentStage={null} />
        </div>
      )}

      {plan && (
        <div className="rounded-md border-2 border-[var(--accent)] bg-[var(--primary)]/15 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Decided after this shot · {TASTE_LABEL[plan.taste]}
          </p>
          <p className="text-lg font-bold tabular-nums">{planText.length ? planText.join(" · ") : "Same recipe"}</p>
        </div>
      )}

      {/* Remount when another shot opens, so the fields start from its notes */}
      <NotesEditor key={shot.id} shot={shot} row={row} pastBrews={pastBrews} face={face ?? null} onFace={onFace} onSaved={onSaved} />

      {shot.profile && (
        <p className="text-sm text-[var(--ink)]/70">
          Profile: <b className="text-[var(--ink)]">{s.profileName}</b>
          {" · "}
          <Link href={`/profile?id=${shot.profile.id}`} className="font-semibold underline underline-offset-2">open</Link>
        </p>
      )}
    </article>
  );
}

function NotesEditor({ shot, row, pastBrews, face, onFace, onSaved }: {
  shot: ShotEntry;
  row: ShotRowData;
  pastBrews: BrewPoint[];
  face: Face | null;
  onFace: (face: Face | null) => void;
  onSaved: () => void;
}) {
  const [taste, setTaste] = useState<Taste | undefined>(row.notes.taste);
  const [tdsInput, setTdsInput] = useState(row.notes.tds != null ? row.notes.tds.toFixed(2) : "");
  const [text, setText] = useState(row.notes.text);
  const [busyFace, setBusyFace] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const tdsValue = Number(tdsInput.replace(",", "."));
  const tds = tdsInput.trim() && tdsValue > 0 && tdsValue < 30 ? tdsValue : undefined;
  const ey = tds != null ? extractionYield(tds, row.sum.weight, row.sum.patch.dose ?? 0) ?? undefined : undefined;
  const changed = taste !== row.notes.taste || tds !== row.notes.tds || text.trim() !== row.notes.text;

  async function setMachineFace(f: Face) {
    const next = face === f ? null : f;
    setBusyFace(true);
    setStatus(null);
    try {
      await rateShot(shot.id, next);
      onFace(next);
    } catch (e) {
      setStatus(`Couldn't send to the machine: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusyFace(false);
  }

  function save() {
    saveShotNote(shot.time, getShotNote(shot.time)?.rating ?? 0, composeShotNote({ taste, tds, ey, text }));
    setStatus("Saved");
    onSaved();
  }

  const chip = (on: boolean) => `h-11 rounded-md border px-3 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  return (
    <section className="rounded-md border border-[var(--ink)]/15 p-3">
      <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Your notes</p>
      {/* The face goes to the machine (the official app shows it too) */}
      <div className="mt-2 flex gap-2" role="group" aria-label="Rating">
        {([["like", "Liked it", Smile], ["dislike", "Didn’t like it", Frown]] as const).map(([f, label, Icon]) => (
          <button key={f} type="button" disabled={busyFace} aria-pressed={face === f} onClick={() => setMachineFace(f)}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-md border-2 text-xs font-semibold uppercase tracking-wider active:scale-[0.97] disabled:opacity-60 ${
              face === f ? "border-[var(--accent)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/20 text-[var(--ink)]/70"}`}>
            {busyFace ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-6 w-6" strokeWidth={1.75} />}
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Taste">
        {(["sour", "balanced", "bitter"] as Taste[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={taste === t}
            onClick={() => setTaste(taste === t ? undefined : t)} className={chip(taste === t)}>
            {TASTE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex h-12 w-40 shrink-0 items-center gap-1.5 rounded-md border border-[var(--ink)]/20 px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">TDS</span>
          <input type="text" inputMode="decimal" value={tdsInput} placeholder="—" aria-label="TDS (%)"
            onChange={(e) => setTdsInput(e.target.value.replace(/[^\d.,]/g, ""))}
            className="w-full min-w-0 bg-transparent text-right text-lg font-bold tabular-nums outline-none placeholder:text-[var(--ink)]/40" />
          <span className="text-sm text-[var(--ink)]/70">%</span>
        </label>
        <p className="text-sm text-[var(--ink)]/75">
          {ey != null ? <>EY <b className="text-lg tabular-nums text-[var(--ink)]">{ey.toFixed(1)}%</b></> : "Refractometer reading, if any"}
        </p>
      </div>

      {/* The brew chart follows the TDS as you type it (saved or not) */}
      {tds != null && ey != null && (
        <div className="mt-3">
          <BrewChart shot={{ tds, ey }} past={pastBrews} target={targetFor(row.sum.patch.ratio)} />
          {pastBrews.length > 0 && (
            <p className="text-xs text-[var(--ink)]/60">Big dot: this shot · open dots: earlier shots of this coffee</p>
          )}
        </div>
      )}

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="Tasting notes: chocolate, a bit sour…"
        className="mt-3 w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base placeholder:text-[var(--ink)]/50" />

      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={save} disabled={!changed}
          className="h-11 rounded-md bg-[var(--primary)] px-6 text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
          Save notes
        </button>
        {status && <p className="text-sm font-semibold text-[var(--ink)]/75">{status}</p>}
      </div>
    </section>
  );
}
