"use client";

/**
 * After the shot: the official app's faces (like / dislike), saved on the
 * machine so every app shows them; the taste and what to change next time
 * (temperature and ratio on the same wheels as the recipe, grind as a
 * suggestion), kept for this coffee; and optional tasting notes.
 */

import { useState } from "react";
import { Frown, Smile } from "lucide-react";
import { WheelPicker } from "@/components/wheel-picker";
import {
  grindLabel, grindOptions, grindTarget, planLines, TASTE_HINT, TASTE_LABEL, type NextPlan, type Taste,
} from "@/lib/next-plan";
import { extractionYield, formatRatio, RATIO_PRESETS, type Recipe } from "@/lib/recipe";

export type Face = "like" | "dislike";
export type PlanChoice = Pick<NextPlan, "taste" | "temperature" | "ratio" | "grindDelta">;

const TEMPS = Array.from({ length: 31 }, (_, i) => 70 + i);
const nearest = (items: number[], v: number) => items.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), items[0]);

export function ShotRating({
  summary, coffee, recipe, shotRecipe, weight, onSave, onSkip,
}: {
  /** e.g. "50.4 g · 0:52 · 1:2.52" */
  summary: string;
  coffee?: string;
  /** e.g. "20 g · 1:2.5 · 94 °C · Motto 80 140µm feed 65 1000rpm" */
  recipe?: string;
  /** The shot's recipe: the wheels start here */
  shotRecipe: Partial<Recipe>;
  /** Beverage weight from the scale (g), for the extraction yield */
  weight: number;
  onSave: (face: Face | null, note: string, plan: PlanChoice | null, tds: number | null) => void;
  onSkip: () => void;
}) {
  const [face, setFace] = useState<Face | null>(null);
  const [note, setNote] = useState("");
  const [taste, setTaste] = useState<Taste | null>(null);
  const [temp, setTemp] = useState(nearest(TEMPS, shotRecipe.temperature ?? 94));
  const [ratio, setRatio] = useState(nearest(RATIO_PRESETS, shotRecipe.ratio ?? 2));
  const [grindDelta, setGrindDelta] = useState<number | undefined>(undefined);
  const [wheel, setWheel] = useState<"temp" | "ratio" | null>(null);
  /** Refractometer reading (DiFluid etc.), as typed */
  const [tdsInput, setTdsInput] = useState("");
  const tdsValue = Number(tdsInput.replace(",", "."));
  const tds = tdsInput.trim() && tdsValue > 0 && tdsValue < 30 ? tdsValue : null;
  const ey = tds != null ? extractionYield(tds, weight, shotRecipe.dose ?? 0) : null;
  const hasCoffee = !!coffee?.trim();

  const plan: PlanChoice | null = taste && {
    taste,
    ...(temp !== shotRecipe.temperature ? { temperature: temp } : {}),
    ...(ratio !== shotRecipe.ratio ? { ratio } : {}),
    ...(grindDelta ? { grindDelta } : {}),
  };
  const lines = plan ? planLines(shotRecipe, plan) : [];

  const faceBtn = (f: Face, label: string, Icon: typeof Smile) => {
    const on = face === f;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={label}
        onClick={() => setFace(on ? null : f)}
        className={`flex h-16 flex-1 items-center justify-center gap-2 rounded-md border-2 active:scale-[0.97] ${
          on ? "border-[var(--accent)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/20 text-[var(--ink)]/70"}`}>
        <Icon className="h-8 w-8" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </button>
    );
  };

  const chip = (on: boolean) =>
    `h-11 rounded-md border px-3 text-sm font-semibold active:scale-[0.97] ${
      on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  /** Same tile + wheel as the recipe on the main screen */
  const tile = (key: "temp" | "ratio", label: string, value: string, changed: boolean, items: number[],
    current: number, format: (v: number) => string, set: (v: number) => void) => (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setWheel(wheel === key ? null : key)}
        className={`flex h-16 w-full flex-col items-center justify-center rounded-md border active:scale-[0.98] ${
          wheel === key ? "border-[var(--ink)] bg-[var(--ink)]/[0.06]" : changed ? "border-2 border-[var(--accent)]" : "border-[var(--ink)]/20"}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink)]/70">{label}</span>
        <span className="text-2xl font-extrabold tabular-nums leading-tight text-[var(--ink)]">{value}</span>
      </button>
      {wheel === key && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setWheel(null)} />
          <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-md border border-[var(--ink)]/30 bg-[var(--paper)] px-1 py-2 shadow-lg">
            <WheelPicker label={label} items={items} value={current} format={format} onChange={set} onDone={() => setWheel(null)} />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 landscape:items-center" onClick={onSkip}>
      <div className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-[var(--paper)] p-4 shadow-xl landscape:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">How was this shot?</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--ink)]">{summary}</p>
        <div className="mt-2 rounded-md border border-[var(--ink)]/15 px-3 py-2">
          <p className="truncate text-base font-semibold text-[var(--ink)]">{coffee?.trim() || "No coffee set"}</p>
          {recipe && <p className="text-sm tabular-nums text-[var(--ink)]/75">{recipe}</p>}
        </div>

        <div className="mt-3 flex gap-3" role="radiogroup" aria-label="Rating">
          {faceBtn("like", "Liked it", Smile)}
          {faceBtn("dislike", "Didn’t like it", Frown)}
        </div>

        {/* Taste, then what to change next time (kept for this coffee) */}
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Taste</p>
        <div className="mt-1 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Taste">
          {(["sour", "balanced", "bitter"] as Taste[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={taste === t}
              onClick={() => { setTaste(taste === t ? null : t); setGrindDelta(undefined); }}
              className={chip(taste === t)}>
              {TASTE_LABEL[t]}
            </button>
          ))}
        </div>

        {taste && taste !== "balanced" && (
          <>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Next time</p>
            <p className="text-sm text-[var(--ink)]/70">{TASTE_HINT[taste]}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {tile("temp", "Temp (°C)", `${temp} °C`, temp !== shotRecipe.temperature, TEMPS, temp, String, setTemp)}
              {tile("ratio", "Ratio", formatRatio(ratio), ratio !== shotRecipe.ratio, RATIO_PRESETS, ratio, formatRatio, setRatio)}
            </div>
            {/* Grind: only a reminder, the grinder is set by hand */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Grind tip</span>
              {grindOptions(taste, shotRecipe).map((d) => (
                <button key={d} type="button" aria-pressed={grindDelta === d}
                  onClick={() => setGrindDelta(grindDelta === d ? undefined : d)} className={chip(grindDelta === d)}>
                  {grindLabel(d, shotRecipe)}{grindTarget(shotRecipe, d) ? ` (${grindTarget(shotRecipe, d)})` : ""}
                </button>
              ))}
            </div>
          </>
        )}
        {taste && (
          <p className="mt-2 text-sm font-semibold text-[var(--accent)]">
            {lines.length ? `Next shot: ${lines.join(" · ")}` : "Next shot: same recipe"}
            {!hasCoffee && <span className="font-normal text-[var(--ink)]/70"> (pick a coffee to keep this plan)</span>}
          </p>
        )}

        {/* Refractometer: TDS in, extraction yield out */}
        <div className="mt-3 flex items-center gap-3">
          <label className="flex h-12 w-40 shrink-0 items-center gap-1.5 rounded-md border border-[var(--ink)]/20 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">TDS</span>
            <input type="text" inputMode="decimal" value={tdsInput} placeholder="—" aria-label="TDS (%)"
              onChange={(e) => setTdsInput(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-full min-w-0 bg-transparent text-right text-lg font-bold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/40" />
            <span className="text-sm text-[var(--ink)]/70">%</span>
          </label>
          <p className="text-sm text-[var(--ink)]/75">
            {ey != null
              ? <>EY <b className="text-lg tabular-nums text-[var(--ink)]">{ey.toFixed(1)}%</b> <span className="text-[var(--ink)]/60">({weight.toFixed(1)} g ÷ {shotRecipe.dose} g)</span></>
              : "Optional: refractometer reading (DiFluid…)"}
          </p>
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Tasting notes (optional): chocolate, a bit sour…"
          className="mt-3 w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink)]/50" />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={onSkip}
            className="h-12 rounded-md border border-[var(--ink)]/20 text-base font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
            Skip
          </button>
          <button type="button" disabled={!face && !note.trim() && !taste && tds == null}
            onClick={() => onSave(face, note.trim(), plan, tds)}
            className="h-12 rounded-md bg-[var(--primary)] text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
