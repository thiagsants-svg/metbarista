"use client";

/**
 * After the shot: the official app's faces (like / dislike), saved on the
 * machine so every app shows them; the taste on a compass (sour ↔ bitter,
 * weak ↔ strong) and what to change next time
 * (temperature and ratio on the same wheels as the recipe, grind as a
 * suggestion), kept for this coffee; and optional tasting notes.
 */

import type { TdsEstimate } from "@/lib/tds-estimate";
import { useState } from "react";
import { Bluetooth, Frown, Loader2, Smile } from "lucide-react";
import type { DifluidState } from "@/lib/difluid";
import { targetFor } from "@/lib/brew-control";
import { BrewChart, type BrewPoint } from "@/components/brew-chart";
import { ShotFactsList } from "@/components/shots/shot-facts";
import type { ShotFact } from "@/lib/shot-facts";
import { WheelPicker } from "@/components/wheel-picker";
import { TasteCompass } from "@/components/taste-compass";
import { compassBody, compassHint, compassTaste, type Body, type CompassPoint } from "@/lib/taste-compass";
import {
  grindNow, planLines, type GrindDir, type NextPlan,
} from "@/lib/next-plan";
import { extractionYield, formatRatio, RATIO_PRESETS, type Recipe } from "@/lib/recipe";

export type Face = "like" | "dislike";
export type PlanChoice = Pick<NextPlan, "taste" | "temperature" | "ratio" | "grind" | "grindWas" | "point">;

const TEMPS = Array.from({ length: 31 }, (_, i) => 70 + i);
const nearest = (items: number[], v: number) => items.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), items[0]);

export function ShotRating({
  summary, coffee, recipe, shotRecipe, weight, deviceTds, tdsEstimate, difluid, difluidMeasuring, difluidNoReply, onDifluid, pastBrews, facts, aside, top = 0, onSave, onSkip,
}: {
  /** px from the top of the screen left uncovered (the Station's readouts, pressure included) */
  top?: number;
  /** Shown beside the popup (the purge piston, while the machine purges): left of it in landscape, above it in portrait */
  aside?: React.ReactNode;
  /** What the shot's curves show (channeling, choking, limits), once the machine saved it */
  facts?: ShotFact[] | null;
  /** e.g. "50.4 g · 0:52 · 1:2.52" */
  summary: string;
  coffee?: string;
  /** e.g. "20 g · 1:2.5 · 94 °C · Motto 80 140µm feed 65 1000rpm" */
  recipe?: string;
  /** The shot's recipe: the wheels start here */
  shotRecipe: Partial<Recipe>;
  /** Beverage weight from the scale (g), for the extraction yield */
  weight: number;
  /** Latest reading from the DiFluid R2 (Bluetooth), with when it arrived */
  deviceTds?: { value: number; at: number } | null;
  difluid?: DifluidState;
  /** Measure sent to the R2, reading not back yet */
  difluidMeasuring?: boolean;
  /** The last Measure got no reading back */
  difluidNoReply?: boolean;
  /** Connects to the R2, or asks it to measure when connected */
  onDifluid?: () => void;
  /** TDS estimated from this coffee's measured shots, shown while no TDS is entered */
  tdsEstimate?: TdsEstimate | null;
  /** Earlier shots of this coffee with a TDS reading, for the brew chart */
  pastBrews?: BrewPoint[];
  onSave: (face: Face | null, note: string, plan: PlanChoice | null, tds: number | null, body?: Body) => void;
  onSkip: () => void;
}) {
  const [face, setFace] = useState<Face | null>(null);
  const [note, setNote] = useState("");
  /** Where the shot sits on the taste compass: sour ↔ bitter, weak ↔ strong */
  const [point, setPoint] = useState<CompassPoint | null>(null);
  const taste = point ? compassTaste(point) : null;
  const body = point ? compassBody(point) : undefined;
  const [temp, setTemp] = useState(nearest(TEMPS, shotRecipe.temperature ?? 94));
  const [ratio, setRatio] = useState(nearest(RATIO_PRESETS, shotRecipe.ratio ?? 2));
  /** Finer or coarser next time, no amount: you set the grinder */
  const [grind, setGrind] = useState<GrindDir | undefined>(undefined);
  const grindWas = grindNow(shotRecipe);
  const [wheel, setWheel] = useState<"temp" | "ratio" | null>(null);
  /** Refractometer reading (DiFluid etc.), as typed */
  const [tdsInput, setTdsInput] = useState("");
  // Readings from the R2 fill the field, unless you typed after them; older readings don't count
  const [openedAt] = useState(() => Date.now());
  const [typedAt, setTypedAt] = useState(0);
  const fromDevice = !!deviceTds && deviceTds.at > openedAt && deviceTds.at > typedAt;
  const tdsShown = fromDevice ? deviceTds!.value.toFixed(2) : tdsInput;
  const tdsValue = Number(tdsShown.replace(",", "."));
  const tds = tdsShown.trim() && tdsValue > 0 && tdsValue < 30 ? tdsValue : null;
  const ey = tds != null ? extractionYield(tds, weight, shotRecipe.dose ?? 0) : null;
  const hasCoffee = !!coffee?.trim();
  const target = targetFor(shotRecipe.ratio);

  const plan: PlanChoice | null = taste && {
    taste,
    ...(point ? { point: { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 } } : {}),
    ...(temp !== shotRecipe.temperature ? { temperature: temp } : {}),
    ...(ratio !== shotRecipe.ratio ? { ratio } : {}),
    ...(grind ? { grind, ...(grindWas ? { grindWas } : {}) } : {}),
  };
  const lines = plan ? planLines(shotRecipe, plan) : [];
  /** Something entered: a tap outside the card must not throw it away (wet hands slip) */
  const touched = !!face || !!note.trim() || !!point || !!tdsShown.trim() || !!grind;

  const faceBtn = (f: Face, label: string, Icon: typeof Smile) => {
    const on = face === f;
    return (
      <button type="button" role="radio" aria-checked={on} aria-label={label}
        onClick={() => setFace(on ? null : f)}
        className={`flex h-16 flex-1 items-center justify-center gap-2 rounded-md border-2 md:h-14 active:scale-[0.97] ${
          on ? "border-[var(--accent)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/20 text-[var(--ink)]/70"}`}>
        <Icon className="h-8 w-8" strokeWidth={1.75} />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </button>
    );
  };

  /** Same tile + wheel as the recipe on the main screen */
  const tile = (key: "temp" | "ratio", label: string, value: string, changed: boolean, items: number[],
    current: number, format: (v: number) => string, set: (v: number) => void) => (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setWheel(wheel === key ? null : key)}
        className={`flex h-16 w-full flex-col items-center justify-center rounded-md border active:scale-[0.98] ${
          wheel === key ? "border-[var(--ink)] bg-[var(--ink)]/[0.06]" : changed ? "border-2 border-[var(--accent)]" : "border-[var(--ink)]/20"}`}>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">{label}</span>
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
    <div className="fixed inset-0 z-[130] flex items-center justify-center gap-3 bg-black/40 p-3 portrait:flex-col" style={{ top }} onClick={() => { if (!touched) onSkip(); }}>
      {aside && (
        <div className="flex shrink-0 overflow-hidden rounded-xl bg-[var(--paper)] text-[var(--ink)] shadow-xl portrait:h-32 portrait:w-full portrait:max-w-lg md:portrait:max-w-3xl landscape:h-[min(26rem,100%)] landscape:w-56"
          onClick={(e) => e.stopPropagation()}>
          {aside}
        </div>
      )}
      <div className="max-h-full min-h-0 w-full max-w-lg overflow-y-auto rounded-xl md:max-w-3xl lg:landscape:max-w-5xl bg-[var(--paper)] p-4 pb-0 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Tablets: the shot and the coffee side by side */}
        <div className="md:flex md:items-center md:gap-4">
          <div className="shrink-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">How was this shot?</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--ink)]">{summary}</p>
          </div>
          <div className="mt-2 min-w-0 flex-1 rounded-md border border-[var(--ink)]/15 px-3 py-2 md:mt-0">
            <p className="truncate text-base font-semibold text-[var(--ink)]">{coffee?.trim() || "No coffee set"}</p>
            {recipe && <p className="text-sm tabular-nums text-[var(--ink)]/75">{recipe}</p>}
          </div>
        </div>
        {facts && facts.length > 0 && <div className="mt-2"><ShotFactsList facts={facts} quietWhenEmpty /></div>}

        <div className="mt-3 flex gap-3" role="radiogroup" aria-label="Rating">
          {faceBtn("like", "Liked it", Smile)}
          {faceBtn("dislike", "Didn’t like it", Frown)}
        </div>

        {/* The two charts side by side from tablet width, the same size: the taste on the compass and the
            extraction on the brew chart (drawn before there's a TDS, so nothing jumps when it comes) */}
        {/* Lying down (wide and short) a third column takes the next time and the notes, so it fits */}
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:landscape:grid-cols-3">
          <section className="flex flex-col rounded-lg border border-[var(--ink)]/15 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Taste</p>
            <div className="flex flex-1 items-center justify-center">
              <TasteCompass value={point} onChange={setPoint} size={236} />
            </div>
          </section>

          {/* Refractometer: TDS in, extraction yield out */}
          <section className="flex min-w-0 flex-col rounded-lg border border-[var(--ink)]/15 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Extraction</p>
              <p className="min-w-0 text-right text-sm text-[var(--ink)]/75">
                {ey != null
                  ? <>EY <b className="text-lg tabular-nums text-[var(--ink)]">{ey.toFixed(1)}%</b> <span className="text-[var(--ink)]/60">({weight.toFixed(1)} g ÷ {shotRecipe.dose} g)</span>
                    {/* The useful direction: a real reading off from the shots made the same way */}
                    {tdsEstimate && Math.abs(ey - tdsEstimate.ey) > 1 && (
                      <span className="block whitespace-normal text-sm font-semibold text-[var(--accent)]">
                        {Math.abs(ey - tdsEstimate.ey).toFixed(1)} {ey < tdsEstimate.ey ? "less" : "more"} than usual ({tdsEstimate.ey}% on {tdsEstimate.n} alike shots): grinder drift, a channel, the water?
                      </span>
                    )}</>
                  : tdsEstimate && point ? (
                    // Only after tasting, so it doesn't steer the taste
                    <span title={`Typical EY ${tdsEstimate.ey}% of ${tdsEstimate.n} measured shots made the same way`}>
                      ≈ TDS <b className="tabular-nums text-[var(--ink)]">{tdsEstimate.tds.toFixed(2)}%</b>
                      <span className="tabular-nums text-[var(--ink)]/70"> ±{tdsEstimate.margin.toFixed(2)}</span>{" "}
                      <span className="text-[var(--ink)]/60">expected if it extracted as the {tdsEstimate.n} alike shots</span>
                    </span>
                  ) : "Optional"}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex h-12 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--ink)]/20 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">TDS</span>
                <input type="text" inputMode="decimal" value={tdsShown} placeholder="—" aria-label="TDS (%)"
                  onChange={(e) => { setTdsInput(e.target.value.replace(/[^\d.,]/g, "")); setTypedAt(Date.now()); }}
                  className="w-full min-w-0 bg-transparent text-right text-lg font-bold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/40" />
                <span className="text-sm text-[var(--ink)]/70">%</span>
              </label>
              {onDifluid && (
                <button type="button" onClick={onDifluid} disabled={difluid === "connecting" || difluidMeasuring}
                  className={`flex h-12 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold active:scale-[0.97] disabled:opacity-50 ${
                    difluid === "on" ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`}>
                  {difluid === "connecting" || difluidMeasuring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
                  {difluidMeasuring ? "Measuring…" : difluid === "on" ? "Measure" : "DiFluid"}
                </button>
              )}
            </div>
            {difluid === "on" && difluidNoReply && (
              <p className="mt-1.5 text-sm font-semibold text-[var(--accent)]">
                No reading came back from the DiFluid. Tap Measure to try again, or type the TDS.
              </p>
            )}
            <div className="mt-2 flex flex-1 items-center">
              <BrewChart shot={tds != null && ey != null ? { tds, ey } : null} past={pastBrews} target={target}
                ratio={weight > 0 && shotRecipe.dose ? weight / shotRecipe.dose : shotRecipe.ratio} />
            </div>
            {!!pastBrews?.length && (
              <p className="text-xs text-[var(--ink)]/60">Open dots: earlier shots of this coffee, joined in order</p>
            )}
          </section>

        <div className="min-w-0 md:col-span-2 lg:landscape:col-span-1">
        {/* What to change next time (kept for this coffee): temperature and ratio on the recipe's wheels,
            grind as which way only, no amount (the grinder is set by hand) */}
        {!taste && (
          <p className="hidden text-sm text-[var(--ink)]/70 lg:landscape:block">
            <span className="text-xs font-semibold uppercase tracking-wider">Next time</span><br />
            Tap where the shot sits on the compass to plan the next one.
          </p>
        )}
        {taste && (
          <div className="mt-3 lg:landscape:mt-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
              Next time
              {compassHint(taste, body) && <span className="ml-2 text-sm font-normal normal-case tracking-normal">{compassHint(taste, body)}</span>}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:landscape:grid-cols-2">
              {tile("temp", "Temp (°C)", `${temp} °C`, temp !== shotRecipe.temperature, TEMPS, temp, String, setTemp)}
              {tile("ratio", "Ratio", formatRatio(ratio), ratio !== shotRecipe.ratio, RATIO_PRESETS, ratio, formatRatio, setRatio)}
              <div role="group" aria-label="Grind next time"
                className={`col-span-2 flex h-16 flex-col rounded-md border md:col-span-1 lg:landscape:col-span-2 ${grind ? "border-2 border-[var(--accent)]" : "border-[var(--ink)]/20"}`}>
                <span className="pt-1 text-center text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
                  Grind{grindWas && <span className="normal-case tracking-normal"> · now {grindWas}</span>}
                </span>
                <div className="grid flex-1 grid-cols-2 gap-1 p-1">
                  {(["finer", "coarser"] as const).map((d) => (
                    <button key={d} type="button" aria-pressed={grind === d} onClick={() => setGrind(grind === d ? undefined : d)}
                      className={`rounded text-sm font-semibold active:scale-[0.97] ${
                        grind === d ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--ink)]/[0.06] text-[var(--ink)]/80"}`}>
                      {d === "finer" ? "Finer" : "Coarser"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--accent)]">
              {lines.length ? `Next shot: ${lines.join(" · ")}` : "Next shot: same recipe"}
              {!hasCoffee && <span className="font-normal text-[var(--ink)]/70"> (pick a coffee to keep this plan)</span>}
            </p>
          </div>
        )}

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Tasting notes (optional): chocolate, a bit sour…"
          className="mt-3 w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base text-[var(--ink)] placeholder:text-[var(--ink)]/50 lg:landscape:h-28" />
        </div>
        </div>

        {/* Skip and Save stay at the bottom of the card, even when the rest scrolls */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-3 grid grid-cols-2 gap-2 border-t border-[var(--ink)]/15 bg-[var(--paper)] px-4 py-3">
          <button type="button" onClick={onSkip}
            className="h-12 rounded-md border border-[var(--ink)]/20 text-base font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
            Skip
          </button>
          <button type="button" disabled={!face && !note.trim() && !taste && tds == null}
            onClick={() => onSave(face, note.trim(), plan, tds, body)}
            className="h-12 rounded-md bg-[var(--primary)] text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
