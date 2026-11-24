"use client";

/**
 * Station — full-screen bar station for a tablet next to the machine
 * (sized for a Galaxy Tab A 10.1, ~800×1280 CSS px, either orientation).
 * Everything fits on one screen: no scrolling.
 *
 * Flow: pick profile, dose, ratio and temperature → Start heating (loads the
 * profile with that temperature and yield, unsaved; the machine then heats,
 * like the official "Start shot") → Water added / Brew when the machine waits
 * for a click (`continue`, like the dial's button). The temperature view stays
 * up from heating until the shot starts. Optional "Auto brew" (off by
 * default, not remembered) taps Brew by itself once the machine is ready.
 * Small controls match the machine's own web UI: Tare, Purge, Raise (home),
 * Preheat (toggle).
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpToLine, Droplets, Flame, Heater, Loader2, Play, Scale, Square, Wind,
} from "lucide-react";
import { ShotCharts, HeatingProgress, COLORS, type ShotPoint } from "@/components/shot-charts";
import { PressureGauge, TemperatureGauge } from "@/components/pressure-gauge";
import { ShotRating } from "@/components/shot-rating";
import { SlideToStart } from "@/components/slide-to-start";
import { MachineNotice } from "@/components/machine-notice";
import { StageNow } from "@/components/profile-program-view";
import { RecentShots } from "@/components/recent-shots";
import { RecipePanel } from "@/components/station/recipe-panel";
import { Readout, SmallButton } from "@/components/station/readout";
import { StationHeader } from "@/components/station/station-header";
import { EspressoGlass } from "@/components/station/espresso-glass";
import { demoShot } from "@/lib/demo-shot";
import { refreshNow } from "@/lib/machine-socket";
import { executeAction, getHistory, getSettings, listProfiles, loadProfileInline, updateSettings } from "@/lib/machine-api";
import { currentAndNext } from "@/lib/profile-program";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import { isExtracting, isHeating, isIdle, isWaitingForUser, isWaitingForWater } from "@/lib/brew-state";
import {
  type Recipe, DEFAULT_RECIPE, beverageWeight, buildShotProfile, formatRatio, loadRecipe, MAX_FINAL_WEIGHT,
  maxYieldFor, overCapacity, pickBaseProfile, saveRecipe, retractionFor, retractionMlToMm, retractionMmToMl,
  sortByMachineOrder, baseName, grindText, grinderFields, isMotto80, rememberBeans, rememberGrinder,
} from "@/lib/recipe";
import { findLastShotForCoffee, logShotNotes, recentShotsForCoffee } from "@/lib/coffee-history";
import { applyPlan, clearPlan, loadPlan } from "@/lib/next-plan";
import { bluetoothSupported } from "@/lib/motto80";
import { fmt, fmtClock, statusLabel, statusPill } from "@/lib/station/format";
import { useStationTheme } from "@/lib/station/use-theme";
import { useStationScreen } from "@/lib/station/use-station-screen";
import { useMachineNotices } from "@/lib/station/use-machine-notices";
import { useMachineLive } from "@/lib/station/use-machine-live";
import { useGrinder } from "@/lib/station/use-grinder";
import { useDifluid } from "@/lib/station/use-difluid";
import { useShotRecord } from "@/lib/station/use-shot-record";
import { countUse } from "@/lib/usage";
import type { ActionType, Profile } from "@/lib/types";

export default function StationPage() {
  useRequireConnection();
  useStationScreen();

  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoEnd, setDemoEnd] = useState<ShotPoint | null>(null);
  const [demoHeat, setDemoHeat] = useState(false);
  /** /station/?demo=pour: the simulated shot still to be played, point by point */
  const [demoPour, setDemoPour] = useState<ShotPoint[] | null>(null);
  /** Auto brew: off by default and on every page load, on purpose. */
  const [autoBrew, setAutoBrew] = useState(false);
  const autoBrewRef = useRef(false);
  const [busy, setBusy] = useState<ActionType | "load" | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recipe, setRecipe] = useState<Recipe>(DEFAULT_RECIPE);
  const [error, setError] = useState<string | null>(null);
  /** Light Swiss or dark bumblebee, remembered on this device */
  const { theme, style: themeStyle, toggle: toggleTheme } = useStationTheme();
  /** When this page last sent Start heating (to tell its shots from ones started on the dial) */
  const startedAtRef = useRef(0);

  const { notices, noticeBusy, respondToNotice, onSocketNotice, showDemoNotice } = useMachineNotices(setError);
  const {
    connected, status, statusRef, preheatLeft, data, setData, grav, heatSamples, setHeatSamples,
    preShot, setTemp, setSetTemp, elapsed, setElapsed, autoFiredRef,
  } = useMachineLive({ onNotice: onSocketNotice, setError, setBusy, setTargetWeight, autoBrewRef, startedAtRef });
  const { grinderLink, linkRef, connectGrinder, toggleGrinder, live: grinderLive } =
    useGrinder({ grinder: recipe.grinder, setRecipe, setError, demo });
  const { difluid, deviceTds, measuring: difluidMeasuring, noReply: difluidNoReply, difluidTap } = useDifluid(setError);
  const brewing = isExtracting(status);
  // Anonymous count of Stations connected to a machine today (see lib/usage.ts)
  useEffect(() => { if (connected) void countUse("s"); }, [connected]);
  const { recentShots, nextPlan, setNextPlan, rateOpen, setRateOpen, showRecent, saveRating, lastFacts } =
    useShotRecord({
      demo, profiles, recipe, brewing, data, linkRef, setError,
      // The machine is waiting for the purge tap after the shot
      purgeAsked: !brewing && isWaitingForUser(status) && /purge/i.test(status?.name ?? ""),
    });

  useEffect(() => {
    // Saved recipe lives in localStorage, read after mount to match the static HTML
    setRecipe(loadRecipe());
    // /station/?demo shows a simulated shot to preview the chart
    const demoParam = new URLSearchParams(window.location.search).get("demo");
    if (demoParam === "notice") showDemoNotice();
    if (demoParam === "heat") {
      // /station/?demo=heat previews the heating view
      setDemoHeat(true);
      setHeatSamples(Array.from({ length: 90 }, (_, i) => {
        const k = 1 - Math.exp(-i / 55);
        return {
          t: i * 2, temp: 40 + 45 * k, barUp: 39 + 50 * k, barMidUp: 39 + 47 * k,
          barMidDown: 40 + 42 * k, barDown: 41 + 36 * k, ext1: 39 + 30 * k, ext2: 39 + 28 * k,
        };
      }));
      setSetTemp(94);
    } else if (demoParam !== null) {
      const pts = demoShot();
      setDemo(true);
      setTargetWeight(40);
      setSetTemp(94);
      if (demoParam === "pour") {
        // /station/?demo=pour plays the shot in real time, to watch the glass fill
        setDemoPour(pts);
      } else {
        setData(pts);
        setElapsed(pts[pts.length - 1].t / 1000);
        setDemoEnd(pts[pts.length - 1]);
      }
      if (demoParam === "rate") setRateOpen(true);
    }
    if (!getSavedIp()) return;
    // Same order as the dial (Settings → Profile order); read only
    Promise.all([listProfiles(), getSettings().catch(() => null)])
      .then(([list, settings]) => setProfiles(sortByMachineOrder(list, settings?.profile_order)))
      .catch((e) => setError(`Couldn't read profiles: ${e instanceof Error ? e.message : e}`));
  // Runs once: the hooks' setters it calls don't change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!demoPour) return;
    // &at=25 skips the first seconds of the simulated shot
    const at = Number(new URLSearchParams(window.location.search).get("at")) || 0;
    let i = Math.max(0, Math.min(demoPour.length - 1, Math.round(at * 5)));
    const id = setInterval(() => {
      i += 1;
      const point = demoPour[i - 1];
      setData(demoPour.slice(0, i));
      setElapsed(point.t / 1000);
      setDemoEnd(point);
      if (i >= demoPour.length) { clearInterval(id); setDemoPour(null); }
    }, 200); // the demo shot has a point every 200 ms
    return () => clearInterval(id);
  }, [demoPour, setData, setElapsed]);

  const baseProfile = pickBaseProfile(profiles, recipe.baseProfileId);

  function updateRecipe(patch: Partial<Recipe>) {
    setRecipe((r) => {
      const next = { ...r, ...patch };
      saveRecipe(next);
      return next;
    });
  }

  async function run(action: ActionType) {
    if (action === "continue" && (statusRef.current?.name ?? "").toLowerCase() === "click to start") {
      autoFiredRef.current = true;
    }
    setBusy(action);
    setError(null);
    try {
      await executeAction(action);
      refreshNow();
    } catch (e) {
      setError(`${action}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Start shot: load the base profile with this recipe (not saved). Like the
   * official "Start shot", loading starts the profile: it heats and waits.
   */
  async function startShot() {
    if (!baseProfile) return;
    setBusy("load");
    setError(null);
    try {
      // Piston draws just the water this recipe needs (set before the profile loads)
      const ml = retractionFor(recipe);
      try {
        const current = (await getSettings()).partial_retraction;
        if (typeof current !== "number" || retractionMmToMl(current) !== ml) {
          await updateSettings({ partial_retraction: retractionMlToMm(ml) });
        }
      } catch (e) {
        // Not worth blocking the shot: the previous retraction stays
        setError(`Couldn't set the retraction to ${ml} ml: ${e instanceof Error ? e.message : String(e)}`);
      }
      await loadProfileInline(buildShotProfile(baseProfile, { ...recipe, ...grinderFields(recipe) }));
      rememberBeans(recipe.coffee);
      // The plan for this coffee is being brewed now; the next one is decided after tasting
      clearPlan(recipe.coffee);
      setNextPlan(null);
      rememberGrinder(recipe);
      logShotNotes(recipe.coffee, grindText(recipe));
      startedAtRef.current = Date.now();
      setTargetWeight(Math.min(MAX_FINAL_WEIGHT, beverageWeight(recipe)));
      updateRecipe({ baseProfileId: baseProfile.id });
      refreshNow();
    } catch (e) {
      setError(`Couldn't start ${baseProfile.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  /** Coffee picked from the recent list: bring back its last shot (recipe, grind, time, score). */
  async function pickCoffee(name: string) {
    if (demo) return;
    // Read the grinder now: connecting needs the tap that picked the coffee
    if (isMotto80(recipe.grinder) && bluetoothSupported() && (grinderLink === "off" || grinderLink === "lost")) connectGrinder();
    try {
      const history = await getHistory(60);
      showRecent(recentShotsForCoffee(name, history, profiles));
      const found = findLastShotForCoffee(name, history, profiles);
      const plan = loadPlan(name);
      setNextPlan(plan);
      if (found) {
        // Last shot's recipe with what was decided after tasting it
        const next = plan ? applyPlan(found.patch, plan) : found.patch;
        // Linked to the grinder: its live settings win (the planned grind is a reminder)
        const live = grinderLive();
        const recipeOnly = { ...next };
        for (const k of ["grinder", "grindUm", "grindSetting", "feed", "rpm"] as const) delete recipeOnly[k];
        updateRecipe(live ? recipeOnly : next);
      }
    } catch (e) {
      setError(`Couldn't read the shot history: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const needsWater = isWaitingForWater(status);
  const waiting = isWaitingForUser(status) && !needsWater;
  const heating = isHeating(status);
  /** Temperature view (chart + gauge) from heating until Brew starts the shot. */
  const tempView = demoHeat || heating || (preShot && !isExtracting(status) && !isIdle(status));
  const idle = isIdle(status);
  const preheating = preheatLeft > 0;
  // In demo mode the readouts show the simulated shot's final values
  const sensors = demoEnd
    ? { ...status?.sensors, w: demoEnd.weight ?? undefined, t: demoEnd.temp ?? undefined, p: demoEnd.pressure ?? 0, f: 0 }
    : status?.sensors;
  const tempTarget = status?.setpoints?.temperature ?? null;
  const online = connected && !!status;
  /** During heating and the shot, Stop is the control that matters: give it the big slot */
  const stopFirst = brewing || heating;

  // ── Main button follows the flow ──
  // idle → Start heating · heating → progress · water → Water added · ready → Brew
  let mainAction: ActionType | "load" | null = null;
  let mainLabel = "Start heating";
  let mainHint = baseProfile
    ? `${recipe.dose}g · ${formatRatio(recipe.ratio)} · ${beverageWeight(recipe)}g · ${recipe.temperature}°C · ${retractionFor(recipe)} ml${overCapacity(recipe) ? ` · ⚠ max ~${maxYieldFor(recipe.dose)} g` : ""}`
    : "Pick a profile";
  let MainIcon: React.ElementType = Play;
  let tone: "start" | "water" | "brew" | "heat" | "busy" | "off" = "start";
  if (!online) { mainLabel = "Connecting"; mainHint = "waiting for the machine"; MainIcon = Loader2; tone = "off"; }
  else if (needsWater) { mainAction = "continue"; mainLabel = "Water added"; mainHint = "Pour the water, then tap"; MainIcon = Droplets; tone = "water"; }
  else if (waiting) {
    mainAction = "continue";
    mainLabel = /purge/i.test(status?.name ?? "") ? "Purge" : "Brew";
    mainHint = "Machine is ready";
    tone = "brew";
  } else if (heating) {
    mainLabel = "Heating";
    mainHint = tempTarget != null && sensors?.t != null
      ? `${sensors.t.toFixed(1)} → ${tempTarget} °C · prep the puck`
      : "prep the puck and cup";
    MainIcon = Flame; tone = "heat";
  } else if (brewing) { mainLabel = "Brewing"; mainHint = fmtClock(elapsed); tone = "busy"; }
  else if (idle) { mainAction = baseProfile ? "load" : null; tone = baseProfile ? "start" : "off"; }
  else { mainLabel = statusLabel(status, connected); mainHint = ""; MainIcon = Loader2; tone = "off"; }

  const toneClass = {
    start: "bg-[var(--primary)] text-[var(--on-primary)]",
    water: "bg-[var(--water)] text-[var(--paper)] animate-pulse",
    brew: "bg-[var(--primary)] text-[var(--on-primary)] animate-pulse",
    heat: "border border-[var(--heat)]/40 bg-[var(--heat)]/10 text-[var(--heat)]",
    busy: "border border-[var(--ink)]/30 bg-[var(--ink)]/[0.06] text-[var(--accent)]",
    off: "bg-[var(--ink)]/[0.05] text-[var(--ink)]/70",
  }[tone];

  /** The cup filling with the scale's weight, up to the target line */
  const glass = (
    <EspressoGlass weight={data[data.length - 1]?.weight} scale={sensors?.w} target={targetWeight}
      flow={data[data.length - 1]?.grav} brewing={brewing || demoPour !== null} />
  );


  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex flex-col [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[var(--ink)] motion-reduce:[&_*]:animate-none gap-2 overflow-hidden bg-[var(--paper)] p-2.5 text-[var(--ink)] select-none sm:gap-2.5 sm:p-3"
      style={{ height: "100dvh", ...themeStyle }}
    >
      <MachineNotice notices={notices} busy={noticeBusy} onRespond={respondToNotice} />

      <StationHeader title="Station" subtitle={status?.loaded_profile ? baseName(status.loaded_profile) : undefined}
        pill={statusPill(status, connected, preheatLeft)}
        theme={theme} onToggleTheme={toggleTheme} />

      {rateOpen && (() => {
        const last = data[data.length - 1];
        const w = last?.weight ?? 0;
        const summary = last
          ? `${w.toFixed(1)} g · ${fmtClock(last.t / 1000)}${recipe.dose > 0 ? ` · 1:${(w / recipe.dose).toFixed(2)}` : ""}`
          : "Shot done";
        const recipeText = [`${recipe.dose} g`, formatRatio(recipe.ratio), `${recipe.temperature} °C`, grindText(recipe)]
          .filter(Boolean).join(" · ");
        return <ShotRating summary={summary} coffee={recipe.coffee} recipe={recipeText}
          shotRecipe={{ ...recipe, ...grinderFields(recipe) }} weight={w}
          deviceTds={deviceTds} difluid={difluid} difluidMeasuring={difluidMeasuring} difluidNoReply={difluidNoReply} onDifluid={difluidTap}
          pastBrews={(recentShots ?? []).flatMap((s) => (s.tds != null && s.ey != null ? [{ tds: s.tds, ey: s.ey }] : []))} // Saved or skipped: back to the coffee's last shots, with the plan just decided
          facts={lastFacts}
          onSkip={() => { setRateOpen(false); setData([]); }}
          onSave={(...args) => { void saveRating(...args); setData([]); }} />;
      })()}
      {error && (
        <button onClick={() => setError(null)}
          className="shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-3 py-1.5 text-left text-sm text-[var(--accent)]">
          {error} <span className="text-[var(--accent)]/50">· tap to dismiss</span>
        </button>
      )}

      {/* ── Body: side by side in landscape, stacked in portrait ── */}
      <div className="grid min-h-0 flex-1 gap-2 sm:gap-2.5 grid-rows-[auto_minmax(0,1fr)_auto] landscape:grid-rows-[auto_minmax(0,1fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(280px,31%)]">
        {/* Readouts */}
        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-2 landscape:col-start-1">
          <Readout label="Time" value={brewing || data.length ? fmtClock(elapsed) : "—"} unit="" color="var(--ink)" />
          <Readout label={sensors?.w != null && sensors.w < -1 && !brewing ? "Weight · tap Tare" : "Weight"}
            value={sensors?.w != null && sensors.w < -1 && !brewing ? "—" : fmt(sensors?.w)}
            unit={targetWeight ? `/ ${targetWeight} g` : "g"} color={COLORS.weight} />
          <Readout label="Flow" value={fmt(sensors?.f)} unit="ml/s" color={COLORS.flow} />
          {/* Gauge: temperature while heating, pressure otherwise */}
          {tempView ? (
            <TemperatureGauge
              value={demoHeat ? heatSamples[heatSamples.length - 1]?.temp : sensors?.t}
              target={tempTarget ?? setTemp} />
          ) : (
            <PressureGauge value={sensors?.p} color={COLORS.pressure} />
          )}
        </div>

        {/* Chart */}
        <div className="flex min-h-0 flex-col landscape:col-start-1">
          <ShotCharts
            data={demoHeat ? [] : data}
            targetWeight={targetWeight}
            // No temperatures on the shot chart: the sensors read the emptying chamber, not the water at the puck
            showTemps={false}
            glass={glass}
            footer={(() => {
              // Program of the running stage: the loaded profile (same id as its base) or the chosen one
              const stageName = demo ? "Pressure Decline" : brewing ? status?.name ?? null : null;
              if (!stageName) {
                if (brewing || tempView) return null;
                if (data.length === 0) return null;
                const last = data[data.length - 1];
                const finalW = last.weight ?? 0;
                const peak = Math.max(0, ...data.map((d) => d.pressure ?? 0));
                return (
                  <div className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-1 border-t-2 border-[var(--ink)] pt-2">
                    <span className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/75">Shot done</span>
                    <span className="text-xl font-extrabold tabular-nums">{finalW.toFixed(1)}<span className="ml-1 text-sm font-medium text-[var(--ink)]/70">{targetWeight ? `/ ${targetWeight} g` : "g"}</span></span>
                    <span className="text-xl font-extrabold tabular-nums">{fmtClock(last.t / 1000)}</span>
                    <span className="text-xl font-extrabold tabular-nums">1:{recipe.dose > 0 ? (finalW / recipe.dose).toFixed(2) : "—"}</span>
                    <span className="text-xl font-extrabold tabular-nums">{peak.toFixed(1)}<span className="ml-1 text-sm font-medium text-[var(--ink)]/70">bar peak</span></span>
                  </div>
                );
              }
              const prof = profiles.find((x) => x.id === status?.id) ?? baseProfile;
              const st = currentAndNext(prof, stageName);
              return <StageNow current={st.current} next={st.next} index={st.index} total={st.total} />;
            })()}
            currentStage={demo ? "Pressure Decline" : brewing ? status?.name ?? null : null}
            live={{ pressure: sensors?.p, flow: sensors?.f, grav, weight: sensors?.w, temp: sensors?.t }}
            placeholder={
              tempView ? (
                <HeatingProgress
                  title={needsWater ? "Add water" : waiting ? (/purge/i.test(status?.name ?? "") ? "Ready to purge" : "Ready to brew") : "Heating"}
                  titleColor={needsWater ? "var(--water)" : waiting ? "var(--accent)" : "var(--heat)"}
                  hint={needsWater ? "Pour the water, then tap Water added"
                    : waiting ? (/purge/i.test(status?.name ?? "") ? "Tap Purge to continue"
                      : autoBrew ? "Auto brew is on: brewing now" : "Tap Brew when you're ready")
                    : "Prep the puck and cup"}
                  samples={heatSamples}
                  target={tempTarget ?? setTemp}
                  current={heatSamples[heatSamples.length - 1]?.temp ?? sensors?.t ?? null}
                />
              ) : needsWater ? (
                <p className="text-2xl font-semibold text-[var(--water)]">Pour the water, then tap “Water added”</p>
              ) : waiting ? (
                <p className="text-2xl font-semibold text-[var(--accent)]">Ready — tap Brew</p>
              ) : (
                // Idle: the last shots of the coffee, and the temperature in one line
                <RecentShots key={`${recipe.coffee ?? ""}|${recentShots?.[0]?.dbKey ?? recentShots?.length ?? "-"}`}
                  coffee={recipe.coffee} shots={recentShots} temp={sensors?.t} plan={nextPlan} />
              )
            }
          />
        </div>

        {/* Controls */}
        <div className="grid min-h-0 gap-2 sm:gap-2.5 grid-cols-[2fr_1fr] grid-rows-[auto_auto_auto] landscape:col-start-2 landscape:row-start-1 landscape:row-span-2 landscape:grid-cols-1 landscape:grid-rows-[auto_minmax(0,1fr)_auto_auto]">
          <RecipePanel
            profiles={profiles}
            base={baseProfile}
            recipe={recipe}
            editable={(idle || preheating) && online && busy === null}
            onChange={updateRecipe}
            onPickCoffee={pickCoffee}
            onToggleGrinder={toggleGrinder}
            grinderLink={grinderLink}
            autoBrew={autoBrew}
            onAutoBrew={(on) => { setAutoBrew(on); autoBrewRef.current = on; }}
          />

          {/* Start heating: slide, so a stray tap can't start the machine. Brew stays a tap (wet hands slide badly). */}
          {mainAction === "load" && busy === null ? (
            <SlideToStart label="Slide to heat" hint={mainHint} onConfirm={startShot}
              className={`${stopFirst ? "order-3" : "order-2"} min-h-[84px] landscape:h-24 landscape:min-h-0 landscape:self-end`} />
          ) : (
          <button
            onClick={() => mainAction === "load" ? startShot() : mainAction && run(mainAction)}
            disabled={!mainAction || busy !== null}
            className={`${stopFirst ? "order-3" : "order-2"} flex min-h-[84px] landscape:min-h-[56px] flex-col items-center justify-center gap-1 rounded-md transition-all active:scale-[0.98] disabled:active:scale-100 ${toneClass}`}
          >
            <span className="flex items-center gap-2.5">
              {busy !== null && busy === mainAction
                ? <Loader2 className="h-7 w-7 animate-spin" />
                : <MainIcon className={`h-7 w-7 ${tone === "heat" ? "animate-pulse" : ""} ${MainIcon === Loader2 ? "animate-spin" : ""}`}
                    fill={MainIcon === Play ? "currentColor" : "none"} />}
              <span className="text-3xl font-bold">{mainLabel}</span>
            </span>
            {mainHint && <span className="text-sm font-medium opacity-75">{mainHint}</span>}
          </button>
          )}

          <button
            onClick={() => run("stop")}
            disabled={!!status && idle}
            className={`${stopFirst ? "order-2 min-h-[84px] text-3xl" : "order-3 min-h-[56px]"} flex items-center justify-center gap-2.5 rounded-md border-2 border-[var(--stop)] bg-transparent text-xl font-bold text-[var(--stop)] active:scale-[0.98] disabled:opacity-30`}
          >
            {busy === "stop" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Square className="h-5 w-5" fill="currentColor" />}
            Stop
          </button>

          {/* Same controls as the machine's own web UI */}
          <div className="order-4 grid grid-cols-4 gap-2 portrait:col-span-2">
            <SmallButton icon={Scale} label="Tare" busy={busy === "tare"}
              disabled={!online || busy !== null} onClick={() => run("tare")} />
            <SmallButton icon={Wind} label="Purge" busy={busy === "purge"}
              disabled={!online || !idle || busy !== null} onClick={() => run("purge")} />
            <SmallButton icon={ArrowUpToLine} label="Raise" busy={busy === "home"}
              disabled={!online || !idle || busy !== null} onClick={() => run("home")} />
            <SmallButton icon={Heater} busy={busy === "preheat"} active={preheating}
              label={preheating ? `Preheat ${fmtClock(preheatLeft)}` : "Preheat"}
              disabled={!online || !(idle || preheating) || busy !== null} onClick={() => run("preheat")} />
          </div>
        </div>
      </div>
    </div>
  );
}
