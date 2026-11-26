"use client";

/**
 * Pour-over on the Meticulous's scale: free pour (the pours are found from the
 * weight) or a guided recipe (when to pour, where to stop, how fast). The
 * server, brewer and coffee are weighed one by one, so the ratio holds all
 * the way; lifting the brewer weighs the drink. Nothing is sent to the
 * machine; brews and recipes stay in this browser. See lib/pour-over.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { Bluetooth, Loader2, Plus, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useRequireConnection } from "@/lib/connection-store";
import { usePourScale } from "@/lib/use-pour-scale";
import {
  brewerLifted, deleteBrew, DEFAULT_RECIPES, fmtClock, guide, isStable, loadBrews, loadRecipes, newDetector, recipeRatio,
  recipeWater, saveBrew, saveRecipes, scaleRecipe, smoothed, step, thinCurve,
  type Detector, type PourBrew, type PourRecipe, type Sample,
} from "@/lib/pour-over";
import { extractionYield, recentBeans } from "@/lib/recipe";
import { useDifluid } from "@/lib/station/use-difluid";
import { TasteCompass } from "@/components/taste-compass";
import { compassBody, compassTaste, compassText, type CompassPoint } from "@/lib/taste-compass";
import { PourScene } from "@/components/pour-over/pour-scene";
import { BrewCurve } from "@/components/pour-over/brew-curve";
import { getKettleIp, readKettle } from "@/lib/kettle";

type Stage = "setup" | "server" | "brewer" | "coffee" | "ready" | "brewing" | "lift" | "result";
type Tab = "brew" | "history" | "recipes";

const SETUP_KEY = "metbarista_pourover_setup";
interface Setup { coffee: string; grinder: string; grind: string; temperature: number; recipeId: string }
const DEFAULT_SETUP: Setup = { coffee: "", grinder: "", grind: "", temperature: 93, recipeId: "" };

const btn = "rounded-lg px-4 py-3 text-base font-semibold active:scale-[0.97] disabled:opacity-40";
const primary = `${btn} bg-[var(--primary)] text-[var(--on-primary)]`;
const ghost = `${btn} border border-[var(--ink)]/25`;
const input = "w-full rounded-md border border-[var(--ink)]/25 bg-transparent px-3 py-2 text-base";
const ratioText = (water: number, dose: number) => (dose > 0 ? `1:${(water / dose).toFixed(1)}` : "—");

export default function PourOverPage() {
  useRequireConnection();
  const [tab, setTab] = useState<Tab>("brew");
  const [recipes, setRecipes] = useState<PourRecipe[]>(DEFAULT_RECIPES);
  const [brews, setBrews] = useState<PourBrew[]>([]);
  useEffect(() => {
    // This browser's own lists, after the first render
    setRecipes(loadRecipes()); // eslint-disable-line react-hooks/set-state-in-effect
    setBrews(loadBrews());
  }, []);

  return (
    <div className="pt-1">
      <div className="mb-4 flex gap-1 rounded-lg bg-[var(--ink)]/[0.05] p-1 sm:max-w-md">
        {(["brew", "history", "recipes"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold capitalize ${tab === t ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--ink)]/70"}`}>
            {t === "history" ? `History (${brews.length})` : t}
          </button>
        ))}
      </div>
      {tab === "brew" && <BrewTab recipes={recipes} onSaved={(list) => { setBrews(list); setTab("history"); }} />}
      {tab === "history" && <HistoryTab brews={brews} onDelete={(id) => setBrews(deleteBrew(id))} />}
      {tab === "recipes" && <RecipesTab recipes={recipes} onChange={(r) => { setRecipes(r); saveRecipes(r); }} />}
    </div>
  );
}

// ── Brew ────────────────────────────────────────────────────

function BrewTab({ recipes, onSaved }: { recipes: PourRecipe[]; onSaved: (list: PourBrew[]) => void }) {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [beans, setBeans] = useState<string[]>([]);
  useEffect(() => {
    try { setSetup({ ...DEFAULT_SETUP, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") }); } catch { /* defaults */ } // eslint-disable-line react-hooks/set-state-in-effect
    setBeans(recentBeans());
  }, []);
  const editSetup = (p: Partial<Setup>) => setSetup((s) => {
    const n = { ...s, ...p };
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(n)); } catch { /* kept for this visit */ }
    return n;
  });

  const [stage, setStage] = useState<Stage>("setup");
  const [recent, setRecent] = useState<Sample[]>([]);
  const [server0, setServer0] = useState(0);
  const [brewer, setBrewer] = useState(0);
  const [dose, setDose] = useState(0);
  const [typedDose, setTypedDose] = useState("");
  /** Raw scale reading that means "no water yet" */
  const [zero, setZero] = useState(0);
  const [det, setDet] = useState<Detector>(newDetector);
  const [all, setAll] = useState<Sample[]>([]);
  const [peak, setPeak] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [drink, setDrink] = useState<number | null>(null);

  const brewing = stage === "ready" || stage === "brewing";
  const onSample = useCallback((s: Sample) => {
    setRecent((r) => [...r.filter((x) => s.t - x.t <= 2), s]);
    if (!brewing) return;
    const water = { t: s.t, w: s.w - zero };
    setAll((a) => [...a, water]);
    setPeak((p) => Math.max(p, water.w));
    setDet((d) => step(d, water));
  }, [brewing, zero]);
  const { weight, connected } = usePourScale(onSample);

  const raw = smoothed(recent).w;
  const stable = isStable(recent);
  const now = recent.length ? recent[recent.length - 1].t : 0;
  const water = brewing || stage === "lift" ? raw - zero : 0;
  const clock = det.t0 != null ? (endAt ?? now) - det.t0 : 0;
  const { flow } = smoothed(det.recent);

  const baseRecipe = recipes.find((r) => r.id === setup.recipeId) ?? null;
  const recipe = baseRecipe && dose > 0 ? scaleRecipe(baseRecipe, dose) : baseRecipe;
  const target = recipe ? recipeWater(recipe) : null;
  const g = recipe && stage === "brewing" ? guide(recipe, clock, water) : null;

  // First pour seen: the brew is on
  useEffect(() => { if (stage === "ready" && det.t0 != null) setStage("brewing"); }, [stage, det.t0]); // eslint-disable-line react-hooks/set-state-in-effect
  // Brewer lifted: weigh the drink once the scale settles
  useEffect(() => {
    if (stage === "brewing" && !det.pouring && brewerLifted(water, peak, brewer, dose)) { setEndAt(now); setStage("lift"); } // eslint-disable-line react-hooks/set-state-in-effect
    if (stage === "lift" && stable && drink == null) { setDrink(Math.max(0, Math.round((raw - server0) * 10) / 10)); setStage("result"); }
  }, [stage, det.pouring, water, peak, brewer, dose, now, stable, raw, server0, drink]);

  // The kettle's temperature every 5 s, when its address is set on the Devices page (read only)
  const [kettleTemp, setKettleTemp] = useState<number | null>(null);
  useEffect(() => {
    const ip = getKettleIp();
    if (!ip) return;
    let alive = true;
    const read = () => readKettle(ip).then((r) => { if (alive) setKettleTemp(r.temp); }).catch(() => { if (alive) setKettleTemp(null); });
    void read();
    const id = setInterval(read, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const reset = () => {
    setStage("setup"); setDet(newDetector()); setAll([]); setPeak(0); setEndAt(null); setDrink(null); setTypedDose("");
  };
  const finishNow = () => { setEndAt(now); setStage("result"); };

  if (!connected && weight == null) {
    return <p className="flex items-center gap-2 py-10 text-base text-[var(--ink)]/75"><Loader2 className="h-5 w-5 animate-spin" />Reaching the machine&apos;s scale…</p>;
  }

  if (stage === "setup") {
    return (
      <div className="grid gap-4 sm:max-w-xl">
        <label className="grid gap-1 text-sm">Coffee
          <input className={input} list="po-beans" value={setup.coffee} onChange={(e) => editSetup({ coffee: e.target.value })} placeholder="Which coffee?" />
          <datalist id="po-beans">{beans.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">Grinder<input className={input} value={setup.grinder} onChange={(e) => editSetup({ grinder: e.target.value })} placeholder="e.g. Comandante" /></label>
          <label className="grid gap-1 text-sm">Grind setting<input className={input} value={setup.grind} onChange={(e) => editSetup({ grind: e.target.value })} placeholder="e.g. 24 clicks" /></label>
        </div>
        <label className="grid gap-1 text-sm">Water temperature, °C (your kettle){kettleTemp != null ? ` · kettle now ${kettleTemp}°` : ""}
          <input className={input} type="number" inputMode="numeric" value={setup.temperature} onChange={(e) => editSetup({ temperature: Number(e.target.value) })} />
        </label>
        <div className="grid gap-2">
          <p className="text-sm">How to brew</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard active={!setup.recipeId} title="Free pour" text="Pour your way: the pours are found from the weight." onClick={() => editSetup({ recipeId: "" })} />
            {recipes.map((r) => (
              <ModeCard key={r.id} active={setup.recipeId === r.id} title={r.name}
                text={`${r.dose} g · 1:${recipeRatio(r).toFixed(1)} · ${r.pours.length} pour${r.pours.length > 1 ? "s" : ""} · ${r.temperature} °C`}
                onClick={() => editSetup({ recipeId: r.id, temperature: r.temperature })} />
            ))}
          </div>
        </div>
        <button className={primary} onClick={() => setStage("server")}>Weigh and brew</button>
      </div>
    );
  }

  if (stage === "server" || stage === "brewer" || stage === "coffee") {
    const steps = {
      server: { n: 1, title: "Put the server on the scale, empty", value: raw, unit: "on the scale" },
      brewer: { n: 2, title: "Put the brewer on it, with its rinsed filter", value: raw - server0, unit: "brewer" },
      coffee: { n: 3, title: "Add the ground coffee", value: raw - server0 - brewer, unit: "coffee" },
    }[stage];
    const next = () => {
      if (stage === "server") { setServer0(raw); setStage("brewer"); }
      else if (stage === "brewer") { setBrewer(Math.max(0, raw - server0)); setStage("coffee"); }
      else {
        const typed = Number(typedDose.replace(",", "."));
        setDose(typed > 0 ? typed : Math.round((raw - server0 - brewer) * 10) / 10);
        setZero(raw); setDet(newDetector()); setAll([]); setPeak(0); setStage("ready");
      }
    };
    return (
      <div className="grid gap-4 sm:max-w-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">Step {steps.n} of 3</p>
        <h2 className="text-2xl font-bold">{steps.title}</h2>
        <p className="text-6xl font-extrabold tabular-nums tracking-tight">{steps.value.toFixed(1)}<span className="ml-2 text-2xl text-[var(--ink)]/60">g {steps.unit}</span></p>
        <p className={`text-sm ${stable ? "text-green-700" : "text-[var(--ink)]/60"}`}>{stable ? "Steady" : "Settling…"}</p>
        {stage === "coffee" && (
          <label className="grid gap-1 text-sm">Or type the dose (g), if you weighed it elsewhere
            <input className={input} inputMode="decimal" value={typedDose} onChange={(e) => setTypedDose(e.target.value)} placeholder="e.g. 15" />
          </label>
        )}
        <div className="flex gap-2">
          <button className={ghost} onClick={reset}>Back</button>
          {stage === "brewer" && <button className={ghost} onClick={() => { setBrewer(0); setServer0(raw); setStage("coffee"); }}>No brewer on it</button>}
          <button className={`${primary} flex-1`} disabled={!stable && !(stage === "coffee" && Number(typedDose.replace(",", ".")) > 0)} onClick={next}>
            {stage === "coffee" ? "Ready to pour" : "Next"}
          </button>
        </div>
        <p className="text-xs text-[var(--ink)]/60">Nothing is sent to the machine: this page keeps its own zero, so the scale&apos;s number may differ.</p>
      </div>
    );
  }

  if (stage === "ready" || stage === "brewing" || stage === "lift") {
    const last = det.pours[det.pours.length - 1];
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(220px,320px)]">
        <div className="grid content-start gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-6xl font-extrabold tabular-nums tracking-tight">{fmtClock(clock)}</p>
            <p className="text-right text-sm text-[var(--ink)]/70">{setup.coffee || "Coffee"} · {dose} g{recipe ? ` · ${recipe.name}` : " · free pour"}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Big label="Water" value={`${Math.max(0, water).toFixed(0)} g`} sub={target ? `of ${target} g` : null} />
            <Big label="Ratio" value={ratioText(Math.max(0, water), dose)} sub={target ? `aim ${ratioText(target, dose)}` : null} />
            <Big label="Flow" value={`${Math.max(0, flow).toFixed(1)} g/s`} sub={g?.phase === "pour" ? `aim ${g.flow.toFixed(1)}` : null} />
          </div>
          {stage === "ready" && <Cue tone="info" text={recipe ? `Start the first pour: ${recipe.pours[0].grams} g. The clock starts with it.` : "Start pouring: the clock starts with the first pour."} />}
          {stage === "lift" && <Cue tone="info" text="Brewer lifted: weighing the drink…" />}
          {g && g.phase === "wait" && <Cue tone={g.startsIn <= 5 ? "go" : "info"} text={`Pour ${g.index + 1} of ${recipe!.pours.length} in ${Math.ceil(g.startsIn)} s · up to ${g.stopAt} g`} blink={g.startsIn <= 5} />}
          {g && g.phase === "pour" && <Cue tone="go" text={`Pour ${g.index + 1} of ${recipe!.pours.length}: up to ${g.stopAt} g · ${Math.max(0, g.stopAt - water).toFixed(0)} g to go`} />}
          {g && g.phase === "done" && <Cue tone="info" text="All poured. Lift the brewer when it has drained." />}
          {!recipe && stage === "brewing" && (
            <Cue tone="info" text={det.pouring ? `Pour ${det.pours.length}…` : `Waiting${last ? ` · ${det.pours.length} pour${det.pours.length > 1 ? "s" : ""} so far` : ""}. Lift the brewer when done.`} />
          )}
          <PourRail pours={det.pours} recipe={recipe} clock={clock} />
          {det.t0 != null && (
            <BrewCurve live curve={thinCurve(all, det.t0).filter(([t]) => t <= clock)} pours={det.pours}
              tEnd={Math.max(clock + 20, ...(recipe?.pours.map((p) => p.at + p.seconds + 20) ?? []))}
              target={recipe ? planSteps(recipe) : undefined} />
          )}
          <div className="flex gap-2">
            <button className={ghost} onClick={reset}>Cancel</button>
            {stage === "brewing" && <button className={`${primary} flex-1`} onClick={finishNow}>Finish without lifting</button>}
          </div>
        </div>
        <div className="h-72 lg:h-96">
          <PourScene pouring={det.pouring} dripping={stage === "brewing" && !det.pouring} water={Math.max(0, water)} target={target} kettleTemp={kettleTemp} />
        </div>
      </div>
    );
  }

  // Result
  return (
    <ResultForm
      base={{
        coffee: setup.coffee, dose, grinder: setup.grinder || undefined, grind: setup.grind || undefined,
        temperature: setup.temperature, recipe: recipe?.name, pours: det.pours,
        curve: det.t0 != null ? thinCurve(all, det.t0).filter(([t]) => t <= clock) : [], water: Math.round(peak * 10) / 10, drink,
        seconds: Math.round(clock),
      }}
      onCancel={reset}
      onSave={(b) => { onSaved(saveBrew(b)); reset(); }}
    />
  );
}

/** The recipe as [s, g of water] points: flat while waiting, rising during each pour */
function planSteps(r: PourRecipe): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let total = 0;
  for (const p of r.pours) {
    pts.push([p.at, total]);
    total += p.grams;
    pts.push([p.at + p.seconds, total]);
  }
  return pts;
}

function ModeCard({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-lg border p-3 text-left ${active ? "border-[var(--primary)] bg-[var(--primary)]/15" : "border-[var(--ink)]/20"}`}>
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-[var(--ink)]/65">{text}</p>
    </button>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div className="border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs tabular-nums text-[var(--ink)]/60">{sub}</p>}
    </div>
  );
}

function Cue({ text, tone, blink }: { text: string; tone: "info" | "go"; blink?: boolean }) {
  return (
    <p className={`rounded-lg px-4 py-3 text-lg font-semibold ${tone === "go" ? "bg-[var(--primary)] text-[var(--on-primary)]" : "bg-[var(--ink)]/[0.06]"} ${blink ? "animate-pulse" : ""}`}>
      {text}
    </p>
  );
}

/** The pours on a time line: done ones solid, the recipe's planned ones outlined */
function PourRail({ pours, recipe, clock }: { pours: Detector["pours"]; recipe: PourRecipe | null; clock: number }) {
  const span = Math.max(60, clock + 15, ...(recipe?.pours.map((p) => p.at + p.seconds + 15) ?? []));
  const x = (s: number) => `${(s / span) * 100}%`;
  return (
    <div className="relative h-10 rounded-md bg-[var(--ink)]/[0.05]">
      {recipe?.pours.map((p, i) => (
        <div key={`r${i}`} className="absolute inset-y-1 rounded border-2 border-dashed border-[var(--ink)]/35" style={{ left: x(p.at), width: x(p.seconds) }} />
      ))}
      {pours.map((p, i) => (
        <div key={i} className="absolute inset-y-2 rounded bg-[var(--accent)]" style={{ left: x(p.start), width: x(Math.max(1, (p.end ?? clock) - p.start)) }} />
      ))}
      <div className="absolute inset-y-0 w-0.5 bg-[var(--ink)]" style={{ left: x(clock) }} />
    </div>
  );
}

// ── Result ──────────────────────────────────────────────────

type BrewBase = Omit<PourBrew, "id" | "at" | "tds" | "ey" | "face" | "compass" | "notes">;

function ResultForm({ base, onSave, onCancel }: { base: BrewBase; onSave: (b: PourBrew) => void; onCancel: () => void }) {
  const [drinkText, setDrinkText] = useState(base.drink != null ? String(base.drink) : "");
  const [tdsText, setTdsText] = useState("");
  const [face, setFace] = useState<"like" | "dislike" | undefined>();
  const [compass, setCompass] = useState<CompassPoint | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { difluid, deviceTds, measuring, difluidTap } = useDifluid(setError);
  useEffect(() => { if (deviceTds) setTdsText(deviceTds.value.toFixed(2)); }, [deviceTds]); // eslint-disable-line react-hooks/set-state-in-effect

  const drink = Number(drinkText.replace(",", ".")) || null;
  const tds = Number(tdsText.replace(",", ".")) || null;
  const ey = tds && drink ? extractionYield(tds, drink, base.dose) : null;

  return (
    <div className="grid gap-4 sm:max-w-xl">
      <h2 className="text-2xl font-bold">Brew done</h2>
      <div className="grid grid-cols-3 gap-3">
        <Big label="Time" value={fmtClock(base.seconds)} sub={`${base.pours.length} pour${base.pours.length === 1 ? "" : "s"}`} />
        <Big label="Water" value={`${base.water.toFixed(0)} g`} sub={ratioText(base.water, base.dose)} />
        <Big label="Drink" value={drink ? `${drink.toFixed(0)} g` : "—"} sub={drink ? `${(base.water - drink).toFixed(0)} g kept by the bed` : null} />
      </div>
      {base.curve.length > 3 && <BrewCurve curve={base.curve} pours={base.pours} />}
      <label className="grid gap-1 text-sm">Drink (g){base.drink == null ? ": lift the brewer and weigh the server, or type it" : ""}
        <input className={input} inputMode="decimal" value={drinkText} onChange={(e) => setDrinkText(e.target.value)} />
      </label>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="grid gap-1 text-sm">TDS (%)
          <input className={input} inputMode="decimal" value={tdsText} onChange={(e) => setTdsText(e.target.value)} placeholder="e.g. 1.35" />
        </label>
        <button className={ghost} onClick={difluidTap}>
          <span className="inline-flex items-center gap-1.5"><Bluetooth className="h-4 w-4" />{difluid === "on" ? (measuring ? "Measuring…" : "Measure") : difluid === "connecting" ? "Connecting…" : "DiFluid"}</span>
        </button>
      </div>
      {ey != null && <p className="text-base">Extraction yield <b>{ey.toFixed(1)}%</b></p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className={`${ghost} flex-1 ${face === "like" ? "bg-green-600/15 border-green-700" : ""}`} onClick={() => setFace(face === "like" ? undefined : "like")}><ThumbsUp className="mx-auto h-6 w-6" /></button>
        <button className={`${ghost} flex-1 ${face === "dislike" ? "bg-red-600/15 border-red-700" : ""}`} onClick={() => setFace(face === "dislike" ? undefined : "dislike")}><ThumbsDown className="mx-auto h-6 w-6" /></button>
      </div>
      <div className="grid justify-items-center gap-1">
        <TasteCompass value={compass} onChange={setCompass} size={220} />
        <p className="text-sm text-[var(--ink)]/70">{compass ? compassText(compassTaste(compass), compassBody(compass)) : "Tap where the taste sits (sour ↔ bitter, weak ↔ strong)"}</p>
      </div>
      <label className="grid gap-1 text-sm">Notes<textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="flex gap-2">
        <button className={ghost} onClick={onCancel}>Discard</button>
        <button className={`${primary} flex-1`} onClick={() => onSave({
          ...base, id: crypto.randomUUID(), at: Date.now(), drink,
          ...(tds ? { tds } : {}), ...(ey != null ? { ey } : {}), ...(face ? { face } : {}),
          ...(compass ? { compass } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
        })}>Save brew</button>
      </div>
    </div>
  );
}

// ── History ─────────────────────────────────────────────────

function HistoryTab({ brews, onDelete }: { brews: PourBrew[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!brews.length) return <p className="py-8 text-base text-[var(--ink)]/70">No pour-over saved yet. They are kept apart from the espresso shots.</p>;
  return (
    <ol className="grid gap-2">
      {brews.map((b) => (
        <li key={b.id} className="rounded-lg border border-[var(--ink)]/15">
          <button className="w-full p-3 text-left" onClick={() => setOpen(open === b.id ? null : b.id)}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">{b.coffee || "Coffee"}{b.face === "like" ? " · liked" : b.face === "dislike" ? " · disliked" : ""}</p>
              <p className="text-xs text-[var(--ink)]/60">{new Date(b.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
            <p className="text-sm tabular-nums text-[var(--ink)]/75">
              {b.dose} g → {b.water.toFixed(0)} g water ({ratioText(b.water, b.dose)}){b.drink ? ` · ${b.drink.toFixed(0)} g drink` : ""} · {fmtClock(b.seconds)}
              {b.tds ? ` · TDS ${b.tds.toFixed(2)}%` : ""}{b.ey ? ` · EY ${b.ey.toFixed(1)}%` : ""}
            </p>
          </button>
          {open === b.id && (
            <div className="grid gap-2 border-t border-[var(--ink)]/10 p-3 text-sm">
              {b.curve.length > 3 && <BrewCurve curve={b.curve} pours={b.pours} />}
              <p>{[b.recipe ?? "Free pour", b.grinder && `${b.grinder}${b.grind ? ` ${b.grind}` : ""}`, b.temperature && `${b.temperature} °C`, `${b.pours.length} pours`].filter(Boolean).join(" · ")}</p>
              {b.compass && <p>Taste: {compassText(compassTaste(b.compass), compassBody(b.compass))}</p>}
              {b.notes && <p className="whitespace-pre-wrap">{b.notes}</p>}
              <button className="inline-flex w-fit items-center gap-1 text-red-700" onClick={() => onDelete(b.id)}><Trash2 className="h-4 w-4" />Delete</button>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Recipes ─────────────────────────────────────────────────

function RecipesTab({ recipes, onChange }: { recipes: PourRecipe[]; onChange: (r: PourRecipe[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const edit = (id: string, f: (r: PourRecipe) => PourRecipe) => onChange(recipes.map((r) => (r.id === id ? f(r) : r)));
  const add = () => {
    const r: PourRecipe = { id: crypto.randomUUID(), name: "My recipe", dose: 15, temperature: 93, pours: [{ at: 0, grams: 45, seconds: 10 }, { at: 45, grams: 195, seconds: 40 }] };
    onChange([...recipes, r]); setEditing(r.id);
  };
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);
  return (
    <div className="grid gap-3 sm:max-w-2xl">
      {recipes.map((r) => (
        <section key={r.id} className="rounded-lg border border-[var(--ink)]/15 p-3">
          <button className="w-full text-left" onClick={() => setEditing(editing === r.id ? null : r.id)}>
            <p className="font-semibold">{r.name}</p>
            <p className="text-sm text-[var(--ink)]/70">{r.dose} g · {recipeWater(r)} g water · 1:{recipeRatio(r).toFixed(1)} · {r.temperature} °C · {r.pours.length} pours</p>
          </button>
          {editing === r.id && (
            <div className="mt-3 grid gap-2 text-sm">
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
                <label className="grid gap-1">Name<input className={input} value={r.name} onChange={(e) => edit(r.id, (x) => ({ ...x, name: e.target.value }))} /></label>
                <label className="grid gap-1">Dose g<input className={input} inputMode="decimal" value={r.dose} onChange={(e) => edit(r.id, (x) => ({ ...x, dose: num(e.target.value) || 1 }))} /></label>
                <label className="grid gap-1">°C<input className={input} inputMode="numeric" value={r.temperature} onChange={(e) => edit(r.id, (x) => ({ ...x, temperature: num(e.target.value) }))} /></label>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wider text-[var(--ink)]/60">Pours: start (s from the first) · grams · seconds</p>
              {r.pours.map((p, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-2">
                  <span className="w-5 text-[var(--ink)]/60">{i + 1}</span>
                  <input className={input} inputMode="numeric" value={p.at} disabled={i === 0} onChange={(e) => edit(r.id, (x) => ({ ...x, pours: x.pours.map((q, j) => (j === i ? { ...q, at: num(e.target.value) } : q)) }))} />
                  <input className={input} inputMode="numeric" value={p.grams} onChange={(e) => edit(r.id, (x) => ({ ...x, pours: x.pours.map((q, j) => (j === i ? { ...q, grams: num(e.target.value) } : q)) }))} />
                  <input className={input} inputMode="numeric" value={p.seconds} onChange={(e) => edit(r.id, (x) => ({ ...x, pours: x.pours.map((q, j) => (j === i ? { ...q, seconds: num(e.target.value) || 1 } : q)) }))} />
                  <button aria-label="Remove pour" disabled={r.pours.length < 2} className="disabled:opacity-30" onClick={() => edit(r.id, (x) => ({ ...x, pours: x.pours.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className={ghost} onClick={() => edit(r.id, (x) => { const l = x.pours[x.pours.length - 1]; return { ...x, pours: [...x.pours, { at: l.at + l.seconds + 30, grams: 50, seconds: 10 }] }; })}>
                  <span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" />Pour</span>
                </button>
                <button className={`${ghost} text-red-700`} onClick={() => { onChange(recipes.filter((x) => x.id !== r.id)); setEditing(null); }}>Delete recipe</button>
              </div>
              <label className="grid gap-1">Notes<textarea className={input} rows={2} value={r.notes ?? ""} onChange={(e) => edit(r.id, (x) => ({ ...x, notes: e.target.value }))} /></label>
            </div>
          )}
        </section>
      ))}
      <div className="flex gap-2">
        <button className={primary} onClick={add}><span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" />New recipe</span></button>
        <button className={ghost} onClick={() => onChange(DEFAULT_RECIPES)}>Restore the starting recipes</button>
      </div>
      <p className="text-xs text-[var(--ink)]/60">Times count from the start of the first pour. A different dose scales every pour&apos;s water, so the ratio stays.</p>
    </div>
  );
}

