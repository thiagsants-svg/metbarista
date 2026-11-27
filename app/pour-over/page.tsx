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
  type Detector, type PourBrew, type PourRecipe, type Sample, suggestions, COMMON_BREWERS, COMMON_FILTERS } from "@/lib/pour-over";
import { extractionYield, recentBeans } from "@/lib/recipe";
import { useDifluid } from "@/lib/station/use-difluid";
import { TasteCompass } from "@/components/taste-compass";
import { compassBody, compassTaste, compassText, type CompassPoint } from "@/lib/taste-compass";
import { PourScene } from "@/components/pour-over/pour-scene";
import { BrewCurve } from "@/components/pour-over/brew-curve";
import { BrewChart } from "@/components/brew-chart";
import { useWakeLock } from "@/lib/use-wake-lock";
import { currentWaterId, loadWaters, waterById, waterText, type WaterRecipe } from "@/lib/water";
import { getKettleIp, readKettle } from "@/lib/kettle";

type Stage = "setup" | "server" | "brewer" | "coffee" | "ready" | "brewing" | "lift" | "result";
type Tab = "brew" | "history" | "recipes";

const SETUP_KEY = "metbarista_pourover_setup";
interface Setup { coffee: string; grinder: string; grind: string; temperature: number; recipeId: string; brewer: string; filter: string; water: string; waterId: string }
const DEFAULT_SETUP: Setup = { coffee: "", grinder: "", grind: "", temperature: 96, recipeId: "", brewer: "", filter: "", water: "", waterId: "" };
/** The weighed dose must be at least this (g), or the coffee was forgotten */
const MIN_DOSE = 3;

const btn = "min-h-11 rounded-lg px-4 py-3 text-base font-semibold active:scale-[0.97] disabled:opacity-40";
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
      <div role="tablist" aria-label="Pour-over" className="mb-4 flex gap-1 rounded-lg bg-[var(--ink)]/[0.05] p-1 sm:max-w-md">
        {(["brew", "history", "recipes"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-md text-base font-semibold capitalize ${tab === t ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--ink)]/70"}`}>
            {t === "history" ? `History (${brews.length})` : t}
          </button>
        ))}
      </div>
      {/* All three stay mounted: looking at the history mid-brew doesn't lose the brew */}
      <div hidden={tab !== "brew"}><BrewTab recipes={recipes} onSaved={(list) => { setBrews(list); setTab("history"); }} /></div>
      <div hidden={tab !== "history"}><HistoryTab brews={brews} onDelete={(id) => setBrews(deleteBrew(id))} /></div>
      <div hidden={tab !== "recipes"}><RecipesTab recipes={recipes} onChange={(r) => { setRecipes(r); saveRecipes(r); }} /></div>
    </div>
  );
}

// ── Brew ────────────────────────────────────────────────────

function BrewTab({ recipes, onSaved }: { recipes: PourRecipe[]; onSaved: (list: PourBrew[]) => void }) {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [beans, setBeans] = useState<string[]>([]);
  const [waters, setWaters] = useState<WaterRecipe[]>([]);
  /** Brewers, filters and grinders used before (then the common ones), for the fields' lists */
  const [picks, setPicks] = useState<{ brewer: string[]; filter: string[]; grinder: string[] }>({ brewer: [], filter: [], grinder: [] });
  useEffect(() => {
    setWaters(loadWaters()); // eslint-disable-line react-hooks/set-state-in-effect
    try { setSetup({ ...DEFAULT_SETUP, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? "{}") }); } catch { /* defaults */ }
    setBeans(recentBeans());
    const brews = loadBrews();
    setPicks({ brewer: suggestions(brews, "brewer", COMMON_BREWERS), filter: suggestions(brews, "filter", COMMON_FILTERS), grinder: suggestions(brews, "grinder") });
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
  const [endAt, setEndAt] = useState<number | null>(null);
  const [drink, setDrink] = useState<number | null>(null);
  /** Added to every scale reading: set when the machine tares mid-brew */
  const [offset, setOffset] = useState(0);
  /** Last scale reading well above zero, to undo a tare */
  const [lastLoaded, setLastLoaded] = useState(0);
  /** When the low "brewer lifted" reading began (s) */
  const [liftSince, setLiftSince] = useState<number | null>(null);
  const [drainedAt, setDrainedAt] = useState<number | null>(null);
  const [kettleAtStart, setKettleAtStart] = useState<number | null>(null);
  const [busyNow, setBusyNow] = useState(false);

  const brewing = stage === "ready" || stage === "brewing";
  const onSample = useCallback((s0: Sample) => {
    const s = { t: s0.t, w: s0.w + offset };
    setRecent((r) => [...r.filter((x) => s.t - x.t <= 2), s]);
    if (Math.abs(s0.w) > 5) setLastLoaded(s0.w);
    if (!brewing || busyNow) return;
    const water = { t: s.t, w: s.w - zero };
    setAll((a) => [...a, water]);
    setDet((d) => step(d, water));
  }, [brewing, zero, offset, busyNow]);
  const { weight, connected, busy } = usePourScale(onSample);
  useEffect(() => { setBusyNow(busy); }, [busy]); // eslint-disable-line react-hooks/set-state-in-effect
  useWakeLock(stage !== "setup");

  // A clock that keeps running even if the scale goes quiet
  const [wall, setWall] = useState(0);
  useEffect(() => {
    if (stage === "setup" || stage === "result") return;
    const id = setInterval(() => setWall(performance.now() / 1000), 250);
    return () => clearInterval(id);
  }, [stage]);
  // Leaving or reloading mid-brew asks first
  useEffect(() => {
    if (stage === "setup" || stage === "result") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  const raw = smoothed(recent).w;
  const stable = isStable(recent);
  const now = recent.length ? recent[recent.length - 1].t : 0;
  const scaleQuiet = stage !== "setup" && stage !== "result" && (!connected || (wall > 0 && now > 0 && wall - now > 1.5));
  /** The scale reads ~0 with things expected on it: tared, or everything lifted */
  const zeroed = (brewing || stage === "lift") && Math.abs(raw - offset) < 2 && server0 - offset > 20;
  const water = brewing || stage === "lift" ? raw - zero : 0;
  /** Water poured: the settled top of the pours (not a single spiky sample) */
  const poured = det.pours.reduce((m, p) => Math.max(m, p.to), 0);
  const clock = det.t0 != null ? (endAt ?? Math.max(now, wall)) - det.t0 : 0;
  const { flow } = smoothed(det.recent);

  const baseRecipe = recipes.find((r) => r.id === setup.recipeId) ?? null;
  const recipe = baseRecipe && dose > 0 ? scaleRecipe(baseRecipe, dose) : baseRecipe;
  const target = recipe ? recipeWater(recipe) : null;
  const g = recipe && stage === "brewing" ? guide(recipe, clock, water) : null;

  // Brewer lifted: the low reading must hold 3 s and look like a server with a drink, else it was a swirl
  useEffect(() => {
    if (zeroed) return;
    const lifted = !det.pouring && brewerLifted(water, poured, brewer, dose);
    if (stage === "brewing" && lifted) { setEndAt(now); setLiftSince(now); setStage("lift"); } // eslint-disable-line react-hooks/set-state-in-effect
    if (stage === "lift" && !lifted) { setEndAt(null); setLiftSince(null); setStage("brewing"); }
    const drinkNow = raw - server0;
    if (stage === "lift" && lifted && stable && liftSince != null && now - liftSince >= 3 && drinkNow > 0.2 * poured && drinkNow < poured + 5) {
      setDrink(Math.round(drinkNow * 10) / 10); setStage("result");
    }
  }, [stage, det.pouring, water, poured, brewer, dose, now, stable, raw, server0, liftSince, zeroed]);

  // The kettle's temperature every 5 s, when its address is set on the Devices page (read only)
  const [kettleTemp, setKettleTemp] = useState<number | null>(null);
  useEffect(() => {
    const ip = getKettleIp();
    if (!ip) return;
    let alive = true;
    let fails = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One read at a time; after 3 failures in a row it stops asking
    const read = async () => {
      try { const r = await readKettle(ip); fails = 0; if (alive) setKettleTemp(r.temp); }
      catch { fails++; if (alive) setKettleTemp(null); }
      if (alive && fails < 3) timer = setTimeout(read, 5000);
    };
    void read();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  // First pour seen: the brew is on, and the kettle's reading at that moment is kept
  useEffect(() => {
    if (stage === "ready" && det.t0 != null) { setStage("brewing"); setKettleAtStart(kettleTemp); } // eslint-disable-line react-hooks/set-state-in-effect
  }, [stage, det.t0, kettleTemp]);

  const reset = () => {
    setStage("setup"); setDet(newDetector()); setAll([]); setEndAt(null); setDrink(null); setTypedDose("");
    setOffset(0); setLiftSince(null); setDrainedAt(null); setKettleAtStart(null);
  };
  const cancel = () => { if (window.confirm("Stop this brew? Nothing will be saved.")) reset(); };
  const finishNow = () => { setEndAt(Math.max(now, wall)); setStage("result"); };
  const resume = () => { setEndAt(null); setDrink(null); setLiftSince(null); setStage("brewing"); };
  /** The machine tared: shift every reading back by what it took off */
  const undoTare = () => setOffset((o) => o + lastLoaded - (raw - o));

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
          <label className="grid gap-1 text-sm">Grinder<input className={input} list="po-grinders" value={setup.grinder} onChange={(e) => editSetup({ grinder: e.target.value })} placeholder="e.g. Comandante" /></label>
          <datalist id="po-grinders">{picks.grinder.map((v) => <option key={v} value={v} />)}</datalist>
          <label className="grid gap-1 text-sm">Grind setting<input className={input} value={setup.grind} onChange={(e) => editSetup({ grind: e.target.value })} placeholder="e.g. 24 clicks" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">Brewer<input className={input} list="po-brewers" value={setup.brewer} onChange={(e) => editSetup({ brewer: e.target.value })} placeholder="e.g. Hario V60 02" /></label>
          <label className="grid gap-1 text-sm">Filter<input className={input} list="po-filters" value={setup.filter} onChange={(e) => editSetup({ filter: e.target.value })} placeholder="e.g. Cafec Abaca" /></label>
          <datalist id="po-brewers">{picks.brewer.map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="po-filters">{picks.filter.map((v) => <option key={v} value={v} />)}</datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {waters.length ? (
            <label className="grid gap-1 text-sm">Water
              <select className={input} value={setup.waterId || currentWaterId() || ""} onChange={(e) => editSetup({ waterId: e.target.value })}>
                <option value="">Not set</option>
                {waters.map((w) => <option key={w.id} value={w.id}>{waterText(w)}</option>)}
              </select>
            </label>
          ) : (
            <label className="grid gap-1 text-sm">Water
              <input className={input} value={setup.water} onChange={(e) => editSetup({ water: e.target.value })} placeholder="e.g. GH 60 / KH 40" />
              <a href="/water" className="text-xs text-[var(--accent)] underline">or add your water recipes</a>
            </label>
          )}
          <label className="grid gap-1 text-sm">Water temperature, °C{kettleTemp != null ? ` · kettle now ${kettleTemp}°` : ""}
            <input className={input} type="number" inputMode="numeric" value={setup.temperature} onChange={(e) => editSetup({ temperature: Number(e.target.value) })} />
          </label>
        </div>
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
        setZero(raw); setDet(newDetector()); setAll([]); setStage("ready");
      }
    };
    return (
      <div className="grid gap-4 sm:max-w-xl">
        <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">Step {steps.n} of 3</p>
        <h2 className="text-2xl font-bold">{steps.title}</h2>
        <p className="text-6xl font-extrabold tabular-nums tracking-tight">{steps.value.toFixed(1)}<span className="ml-2 text-2xl text-[var(--ink)]/60">g {steps.unit}</span></p>
        <p className={`w-fit rounded-full px-3 py-1 text-base font-semibold ${stable ? "bg-[var(--good)] text-[var(--paper)]" : "bg-[var(--ink)]/10 text-[var(--ink)]/75"}`}>{stable ? "Steady" : "Waiting for a steady reading…"}</p>
        {stage === "coffee" && (
          <label className="grid gap-1 text-sm">Or type the dose (g), if you weighed it elsewhere
            <input className={input} inputMode="decimal" value={typedDose} onChange={(e) => setTypedDose(e.target.value)} placeholder="e.g. 15" />
          </label>
        )}
        <div className="flex gap-2">
          <button className={ghost} onClick={() => setStage(stage === "coffee" ? "brewer" : stage === "brewer" ? "server" : "setup")}>Back</button>
          {stage === "brewer" && <button className={ghost} onClick={() => { setBrewer(0); setServer0(raw); setStage("coffee"); }}>No brewer on it</button>}
          <button className={`${primary} flex-1`} onClick={next}
            disabled={stage === "coffee"
              ? !(Number(typedDose.replace(",", ".")) >= MIN_DOSE || (stable && raw - server0 - brewer >= MIN_DOSE))
              : !stable}>
            {stage === "coffee" ? "Ready to pour" : "Next"}
          </button>
        </div>
        {stage === "coffee" && stable && raw - server0 - brewer < MIN_DOSE && !(Number(typedDose.replace(",", ".")) >= MIN_DOSE) && (
          <p className="text-base text-[var(--bad)]">No coffee on the scale yet.</p>
        )}
        <p className="text-sm text-[var(--ink)]/65">Nothing is sent to the machine: this page keeps its own zero, so the scale&apos;s number may differ.</p>
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
          {busy && <Cue tone="warn" text="The machine is brewing or heating: its scale belongs to the shot. Pour-over is paused." />}
          {scaleQuiet && <Cue tone="warn" text="Scale not responding: reconnecting… The clock keeps running." />}
          {zeroed && (
            <div className="grid gap-2 rounded-lg bg-[var(--warn)]/15 p-3">
              <p className="text-lg font-semibold">The scale reads 0: was it tared, or was everything lifted?</p>
              <div className="flex flex-wrap items-center gap-2">
                <button className={primary} onClick={undoTare}>It was tared: carry on</button>
                <span className="text-sm text-[var(--ink)]/70">Lifted? Put it all back.</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Big label="Water" value={`${Math.max(0, water).toFixed(0)} g`} sub={target ? `of ${target} g` : null} />
            <Big label="Ratio" value={ratioText(Math.max(0, water), dose)} sub={target ? `aim ${ratioText(target, dose)}` : null} />
            <Big label="Flow" value={`${Math.max(0, flow).toFixed(1)} g/s`} sub={g?.phase === "pour" ? `aim ${g.flow.toFixed(1)}` : null} />
          </div>
          {stage === "ready" && <Cue tone="info" text={recipe ? `Start the first pour: ${recipe.pours[0].grams} g. The clock starts with it.` : "Start pouring: the clock starts with the first pour."} />}
          {stage === "lift" && <Cue tone="info" text="Brewer off the server: weighing the drink in a moment. Swirling? Put it back and the brew carries on." />}
          {g && g.phase === "wait" && <Cue tone={g.startsIn <= 5 ? "go" : "info"} blink={g.startsIn <= 5}
            text={`${prevAction(recipe!, g.index)}Pour ${g.index + 1} of ${recipe!.pours.length} in ${Math.ceil(g.startsIn)} s · up to ${g.stopAt} g`} />}
          {g && g.phase === "pour" && <Cue tone="go" text={`Pour ${g.index + 1} of ${recipe!.pours.length}: up to ${g.stopAt} g · ${Math.max(0, g.stopAt - water).toFixed(0)} g to go`} />}
          {g && g.phase === "done" && <Cue tone="info" text={`${prevAction(recipe!, recipe!.pours.length)}All poured. Tap "Bed drained" when the water is through, then lift the brewer.`} />}
          {!recipe && stage === "brewing" && (
            <Cue tone="info" text={det.pouring ? `Pour ${det.pours.length}…` : `Waiting${last ? ` · ${det.pours.length} pour${det.pours.length > 1 ? "s" : ""} so far` : ""}. Lift the brewer when done.`} />
          )}
          <PourRail pours={det.pours} recipe={recipe} clock={clock} />
          {det.t0 != null && (
            <BrewCurve live curve={thinCurve(all, det.t0).filter(([t]) => t <= clock)} pours={det.pours}
              tEnd={Math.max(clock + 20, ...(recipe?.pours.map((p) => p.at + p.seconds + 20) ?? []))}
              target={recipe ? planSteps(recipe) : undefined} />
          )}
          {stage === "brewing" && det.pours.length > 0 && !det.pouring && (
            <button className={`${btn} min-h-14 w-full border-2 border-[var(--ink)] text-lg`} onClick={() => setDrainedAt(Math.round(clock))}>
              {drainedAt != null ? `Bed drained at ${fmtClock(drainedAt)} · tap again to change` : "Bed drained"}
            </button>
          )}
          <div className="flex justify-between gap-2">
            {stage === "brewing" && <button className={`${primary} flex-1`} onClick={finishNow}>Finish without lifting</button>}
            <button className={`${ghost} ml-auto`} onClick={cancel}>Cancel brew</button>
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
        curve: det.t0 != null ? thinCurve(all, det.t0).filter(([t]) => t <= clock) : [], water: Math.round(poured * 10) / 10, drink,
        seconds: Math.round(clock),
        ...(drainedAt != null ? { drained: drainedAt } : {}),
        ...(kettleAtStart != null ? { kettleTemp: kettleAtStart } : {}),
        ...(setup.brewer.trim() ? { brewer: setup.brewer.trim() } : {}),
        ...(setup.filter.trim() ? { filter: setup.filter.trim() } : {}),
        ...(() => {
          const w = waterById(setup.waterId || currentWaterId(), waters);
          return w ? { waterId: w.id, waterNote: waterText(w) } : setup.water.trim() ? { waterNote: setup.water.trim() } : {};
        })(),
      }}
      plan={recipe ? planSteps(recipe) : undefined}
      past={loadBrews().filter((o) => o.tds && o.ey != null && sameCoffeeName(o.coffee, setup.coffee)).map((o) => ({ tds: o.tds!, ey: o.ey! }))}
      onResume={resume}
      onCancel={reset}
      onSave={(b) => { onSaved(saveBrew(b)); reset(); }}
    />
  );
}

/** "Swirl the brewer. " after the pour before `index`, when the recipe asks for it */
function prevAction(r: PourRecipe, index: number): string {
  const a = r.pours[index - 1]?.then;
  return a === "swirl" ? "Swirl the brewer. " : a === "stir" ? "Stir the bed gently. " : "";
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
    <button onClick={onClick} aria-pressed={active} className={`rounded-lg border p-3 text-left ${active ? "border-[var(--primary)] bg-[var(--primary)]/15" : "border-[var(--ink)]/20"}`}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-[var(--ink)]/70">{text}</p>
    </button>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub: string | null }) {
  return (
    <div className="border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-sm uppercase tracking-wider text-[var(--ink)]/70">{label}</p>
      <p className="text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      {sub && <p className="text-sm tabular-nums text-[var(--ink)]/70">{sub}</p>}
    </div>
  );
}

function Cue({ text, tone, blink }: { text: string; tone: "info" | "go" | "warn"; blink?: boolean }) {
  const look = tone === "go" ? "bg-[var(--primary)] text-[var(--on-primary)]" : tone === "warn" ? "bg-[var(--warn)]/20 border border-[var(--warn)]" : "bg-[var(--ink)]/[0.06]";
  return (
    <p role={tone === "warn" ? "alert" : undefined} className={`rounded-lg px-4 py-3 text-lg font-semibold ${look} ${blink ? "motion-safe:animate-pulse" : ""}`}>
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

const sameCoffeeName = (a: string, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Filter target (SCA-style brew control chart): extraction 18–22 %, strength 1.15–1.45 % TDS */
const FILTER_EY: [number, number] = [18, 22];
const FILTER_TDS: [number, number] = [1.15, 1.45];
const FILTER_TARGET = { name: "Filter", ey: FILTER_EY, tds: FILTER_TDS };

function ResultForm({ base, plan, past = [], onSave, onCancel, onResume }: {
  base: BrewBase;
  plan?: [number, number][];
  /** This coffee's earlier measured brews, newest first */
  past?: { tds: number; ey: number }[];
  onSave: (b: PourBrew) => void;
  onCancel: () => void;
  onResume: () => void;
}) {
  const [drinkText, setDrinkText] = useState(base.drink != null ? String(base.drink) : "");
  const [bypassText, setBypassText] = useState("");
  const [tdsText, setTdsText] = useState("");
  const [face, setFace] = useState<"like" | "dislike" | undefined>();
  const [compass, setCompass] = useState<CompassPoint | null>(null);
  const [dry, setDry] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { difluid, deviceTds, measuring, difluidTap } = useDifluid(setError);
  useEffect(() => { if (deviceTds) setTdsText(deviceTds.value.toFixed(2)); }, [deviceTds]); // eslint-disable-line react-hooks/set-state-in-effect

  const drink = Number(drinkText.replace(",", ".")) || null;
  const bypass = Number(bypassText.replace(",", ".")) || 0;
  const tds = Number(tdsText.replace(",", ".")) || null;
  // TDS read after the bypass was added: the extraction is on the whole cup
  const ey = tds && drink ? extractionYield(tds, drink + bypass, base.dose) : null;
  const time = base.drained ?? base.seconds;
  const verdict = tds && ey != null ? [
    ey < FILTER_EY[0] ? "under-extracted" : ey > FILTER_EY[1] ? "over-extracted" : "extraction in range",
    tds < FILTER_TDS[0] ? "weak" : tds > FILTER_TDS[1] ? "strong" : "strength in range",
  ].join(" · ") : null;

  return (
    <div className="grid gap-4 sm:max-w-xl">
      <h2 className="text-2xl font-bold">Brew done</h2>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Big label={base.drained != null ? "Drained at" : "Time"} value={fmtClock(time)} sub={`${base.pours.length} pour${base.pours.length === 1 ? "" : "s"}`} />
        <Big label="Water" value={`${base.water.toFixed(0)} g`} sub={ratioText(base.water, base.dose)} />
        <Big label="Drink" value={drink ? `${drink.toFixed(0)} g` : "—"} sub={drink ? `${(base.water - drink).toFixed(0)} g kept by the bed` : null} />
      </div>
      {base.kettleTemp != null && <p className="text-sm text-[var(--ink)]/70">Kettle read {base.kettleTemp}° when the first pour began.</p>}
      {base.curve.length > 3 && <BrewCurve curve={base.curve} pours={base.pours} target={plan} />}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">Drink (g){base.drink == null ? ": weigh the server, or type it" : ""}
          <input className={input} inputMode="decimal" value={drinkText} onChange={(e) => setDrinkText(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">Bypass water added (g)
          <input className={input} inputMode="decimal" value={bypassText} onChange={(e) => setBypassText(e.target.value)} placeholder="0" />
        </label>
      </div>
      <p className="rounded-md bg-[var(--ink)]/[0.05] p-3 text-sm">
        Before measuring: swirl the server well (the first drops are much stronger), take the sample from the middle and let it cool to room temperature. Same way every time.
      </p>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="grid gap-1 text-sm">TDS (%)
          <input className={input} inputMode="decimal" value={tdsText} onChange={(e) => setTdsText(e.target.value)} placeholder="e.g. 1.35" />
        </label>
        <button className={ghost} onClick={difluidTap}>
          <span className="inline-flex items-center gap-1.5"><Bluetooth className="h-4 w-4" />{difluid === "on" ? (measuring ? "Measuring…" : "Measure") : difluid === "connecting" ? "Connecting…" : "DiFluid"}</span>
        </button>
      </div>
      {ey != null && (
        <p className="text-base">Extraction yield <b>{ey.toFixed(1)}%</b>{verdict ? <> · <span className="text-[var(--ink)]/80">{verdict}</span></> : null}
          <span className="block text-sm text-[var(--ink)]/65">Filter target: extraction {FILTER_EY[0]}–{FILTER_EY[1]}%, strength {FILTER_TDS[0]}–{FILTER_TDS[1]}% TDS. Taste decides.</span>
        </p>
      )}
      {(tds && ey != null) || past.length ? (
        <div className="sm:max-w-md">
          <BrewChart filter target={FILTER_TARGET} shot={tds && ey != null ? { tds, ey } : null} past={past}
            ratio={drink ? (drink + bypass) / base.dose : undefined} />
        </div>
      ) : null}
      {error && <p className="text-sm text-[var(--bad)]">{error}</p>}
      <div className="flex gap-2" role="radiogroup" aria-label="Verdict">
        <button role="radio" aria-checked={face === "like"} aria-label="Liked" className={`${ghost} min-h-14 flex-1 ${face === "like" ? "border-[var(--good)] bg-[var(--good)]/15" : ""}`} onClick={() => setFace(face === "like" ? undefined : "like")}><ThumbsUp className="mx-auto h-7 w-7" /></button>
        <button role="radio" aria-checked={face === "dislike"} aria-label="Disliked" className={`${ghost} min-h-14 flex-1 ${face === "dislike" ? "border-[var(--bad)] bg-[var(--bad)]/15" : ""}`} onClick={() => setFace(face === "dislike" ? undefined : "dislike")}><ThumbsDown className="mx-auto h-7 w-7" /></button>
      </div>
      <div className="grid justify-items-center gap-2">
        <TasteCompass value={compass} onChange={setCompass} size={220} />
        <p className="text-sm text-[var(--ink)]/70">{compass ? compassText(compassTaste(compass), compassBody(compass)) : "Tap where the taste sits (sour ↔ bitter, weak ↔ strong)"}</p>
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input type="checkbox" className="h-6 w-6" checked={dry} onChange={(e) => setDry(e.target.checked)} />
          Dry or astringent finish (fines, channelling or too much agitation; not the same as bitter)
        </label>
      </div>
      <label className="grid gap-1 text-sm">Notes<textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <button className={ghost} onClick={() => { if (window.confirm("Discard this brew? The TDS, taste and notes won't be saved.")) onCancel(); }}>Discard</button>
        <button className={ghost} onClick={onResume}>Back to the brew</button>
        <button className={`${primary} flex-1`} onClick={() => onSave({
          ...base, id: crypto.randomUUID(), at: Date.now(), drink,
          ...(bypass > 0 ? { bypass } : {}),
          ...(tds ? { tds } : {}), ...(ey != null ? { ey } : {}), ...(face ? { face } : {}),
          ...(compass ? { compass } : {}), ...(dry ? { dry } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}),
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
          <button className="w-full p-3 text-left" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">{b.coffee || "Coffee"}{b.face === "like" ? " · liked" : b.face === "dislike" ? " · disliked" : ""}</p>
              <p className="text-sm text-[var(--ink)]/65">{new Date(b.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
            <p className="text-sm tabular-nums text-[var(--ink)]/75">
              {b.dose} g → {b.water.toFixed(0)} g water ({ratioText(b.water, b.dose)}){b.drink ? ` · ${b.drink.toFixed(0)} g drink` : ""} · {fmtClock(b.drained ?? b.seconds)}{b.drained != null ? " drained" : ""}
              {b.tds ? ` · TDS ${b.tds.toFixed(2)}%` : ""}{b.ey ? ` · EY ${b.ey.toFixed(1)}%` : ""}
            </p>
          </button>
          {open === b.id && (
            <div className="grid gap-2 border-t border-[var(--ink)]/10 p-3 text-sm">
              {b.curve.length > 3 && <BrewCurve curve={b.curve} pours={b.pours} />}
              {b.tds && b.ey != null && (
                <div className="sm:max-w-md">
                  <BrewChart filter target={FILTER_TARGET} shot={{ tds: b.tds, ey: b.ey }}
                    past={brews.filter((o) => o.id !== b.id && o.at < b.at && o.tds && o.ey != null && sameCoffeeName(o.coffee, b.coffee)).map((o) => ({ tds: o.tds!, ey: o.ey! }))} />
                </div>
              )}
              <p>{[b.recipe ?? "Free pour", b.brewer, b.filter, b.grinder && `${b.grinder}${b.grind ? ` ${b.grind}` : ""}`,
                b.temperature && `${b.temperature} °C set`, b.kettleTemp != null && `kettle ${b.kettleTemp}°`, b.waterNote && `water ${b.waterNote}`,
                b.bypass && `bypass ${b.bypass} g`, `${b.pours.length} pours`].filter(Boolean).join(" · ")}</p>
              {(b.compass || b.dry) && <p>Taste: {[b.compass && compassText(compassTaste(b.compass), compassBody(b.compass)), b.dry && "dry finish"].filter(Boolean).join(" · ")}</p>}
              {b.notes && <p className="whitespace-pre-wrap">{b.notes}</p>}
              <button className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md px-2 text-[var(--bad)]"
                onClick={() => { if (window.confirm("Delete this brew? It can't be undone.")) onDelete(b.id); }}><Trash2 className="h-5 w-5" />Delete</button>
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
  const editPour = (id: string, i: number, p: Partial<PourRecipe["pours"][number]>) =>
    edit(id, (x) => ({ ...x, pours: x.pours.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  const add = () => {
    const r: PourRecipe = { id: crypto.randomUUID(), name: "My recipe", dose: 15, temperature: 96, pours: [{ at: 0, grams: 45, seconds: 10, then: "swirl" }, { at: 45, grams: 195, seconds: 40 }] };
    onChange([...recipes, r]); setEditing(r.id);
  };
  const missingDefaults = DEFAULT_RECIPES.filter((d) => !recipes.some((r) => r.id === d.id));
  const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);
  return (
    <div className="grid gap-3 sm:max-w-2xl">
      {recipes.map((r) => (
        <section key={r.id} className="rounded-lg border border-[var(--ink)]/15 p-3">
          <button className="w-full text-left" aria-expanded={editing === r.id} onClick={() => setEditing(editing === r.id ? null : r.id)}>
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
              <p className="mt-1 text-sm text-[var(--ink)]/70">Each pour: start (s from the first) · grams · seconds · then</p>
              {r.pours.map((p, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_1.3fr_auto] items-center gap-2">
                  <span className="w-5 text-[var(--ink)]/70">{i + 1}</span>
                  <input aria-label={`Pour ${i + 1} start, seconds`} className={input} inputMode="numeric" value={p.at} disabled={i === 0} onChange={(e) => editPour(r.id, i, { at: num(e.target.value) })} />
                  <input aria-label={`Pour ${i + 1} water, grams`} className={input} inputMode="numeric" value={p.grams} onChange={(e) => editPour(r.id, i, { grams: num(e.target.value) })} />
                  <input aria-label={`Pour ${i + 1} length, seconds`} className={input} inputMode="numeric" value={p.seconds} onChange={(e) => editPour(r.id, i, { seconds: num(e.target.value) || 1 })} />
                  <select aria-label={`After pour ${i + 1}`} className={input} value={p.then ?? ""} onChange={(e) => editPour(r.id, i, { then: (e.target.value || undefined) as "swirl" | "stir" | undefined })}>
                    <option value="">—</option><option value="swirl">swirl</option><option value="stir">stir</option>
                  </select>
                  <button aria-label={`Remove pour ${i + 1}`} disabled={r.pours.length < 2} className="flex h-11 w-11 items-center justify-center disabled:opacity-30"
                    onClick={() => edit(r.id, (x) => ({ ...x, pours: x.pours.filter((_, j) => j !== i) }))}><Trash2 className="h-5 w-5" /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button className={ghost} onClick={() => edit(r.id, (x) => { const l = x.pours[x.pours.length - 1]; return { ...x, pours: [...x.pours, { at: l.at + l.seconds + 30, grams: 50, seconds: 10 }] }; })}>
                  <span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" />Pour</span>
                </button>
                <button className={`${ghost} text-[var(--bad)]`} onClick={() => { if (window.confirm(`Delete the recipe "${r.name}"?`)) { onChange(recipes.filter((x) => x.id !== r.id)); setEditing(null); } }}>Delete recipe</button>
              </div>
              <label className="grid gap-1">Notes<textarea className={input} rows={2} value={r.notes ?? ""} onChange={(e) => edit(r.id, (x) => ({ ...x, notes: e.target.value }))} /></label>
            </div>
          )}
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        <button className={primary} onClick={add}><span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" />New recipe</span></button>
        {missingDefaults.length > 0 && (
          <button className={ghost} onClick={() => onChange([...recipes, ...missingDefaults])}>Add back the starting recipes ({missingDefaults.length})</button>
        )}
      </div>
      <p className="text-sm text-[var(--ink)]/65">Times count from the start of the first pour. A different dose scales each pour&apos;s water and its time, so the ratio and the flow stay.</p>
    </div>
  );
}
