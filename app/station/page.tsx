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

import { estimateTds, eyReferences, type EyReference } from "@/lib/tds-estimate";
import { shotSummary } from "@/lib/coffee-history";
import { timeHM } from "@/lib/format-date";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpToLine, Droplets, Flame, Heater, Loader2, Play, Scale, Smile, Square, Wind,
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
import { PurgePiston } from "@/components/station/purge-piston";
import { InstallHint } from "@/components/station/install-hint";
import { NewsLine } from "@/components/station/news-line";
import { mainButton } from "@/lib/station/main-button";
import { usePurgeRelease } from "@/lib/station/use-purge-release";
import { OfflineCard } from "@/components/station/offline-card";
import { getSavedHostname, saveHostname } from "@/lib/machine-ip";
import { readingsOf, type Readings } from "@/lib/station/readings";
import { applyDemo, useStationDemoPlayback } from "@/lib/station/use-station-demo";
import { profileTips } from "@/lib/profile-tip";
import { listMaintenance, loadIntervals, maintenanceCounts, type MaintenanceCount } from "@/lib/piston-store";
import { refreshNow } from "@/lib/machine-socket";
import { executeAction, getHistoryLight, getHistoryPicked, getMachineInfo, getSettings, getShotTimes, listProfiles, loadProfileInline, updateSettings } from "@/lib/machine-api";
import { pickRecentShots } from "@/lib/coffee-history";
import { currentAndNext } from "@/lib/profile-program";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import { isClickToStart, isExtracting, isHeating, isIdle, isPurgeWait, isPurging, isWaitingForUser, isWaitingForWater } from "@/lib/brew-state";
import {
  type Recipe, DEFAULT_RECIPE, beverageWeight, buildShotProfile, formatRatio, loadRecipe, MAX_FINAL_WEIGHT,
  maxYieldFor, overCapacity, pickBaseProfile, saveRecipe, retractionFor, retractionMlToMm, retractionMmToMl,
  sortByMachineOrder, baseName, grindText, grinderFields, isMotto80, rememberBeans, rememberGrinder,
} from "@/lib/recipe";
import { findLastShotForCoffee, logShotNotes, recentShotsForCoffee } from "@/lib/coffee-history";
import { applyPlan, clearPlan, loadPlan } from "@/lib/next-plan";
import { bluetoothSupported } from "@/lib/motto80";
import { fmt, fmtClock, statusPill, explainError, actionWord } from "@/lib/station/format";
import { useStationTheme } from "@/lib/station/use-theme";
import { useStationScreen } from "@/lib/station/use-station-screen";
import { useMachineNotices } from "@/lib/station/use-machine-notices";
import { useMachineLive } from "@/lib/station/use-machine-live";
import { useGrinder } from "@/lib/station/use-grinder";
import { useDifluid } from "@/lib/station/use-difluid";
import { useShotRecord } from "@/lib/station/use-shot-record";
import { countMachine, countUse, counting, machineCounted } from "@/lib/usage";
import { currentWaterId } from "@/lib/water";
import type { ActionType, Profile } from "@/lib/types";

export default function StationPage() {
  useRequireConnection();
  useStationScreen();

  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [demoEnd, setDemoEnd] = useState<ShotPoint | null>(null);
  const [demoHeat, setDemoHeat] = useState(false);
  /** /station/?demo=purge: the piston going down and back up, without the machine */
  const [demoPurge, setDemoPurge] = useState<"purge" | "home" | null>(null);
  /** The demo purge's pressure, bar */
  const [demoPressure, setDemoPressure] = useState<number | null>(null);
  const demoPurgeOn = demoPurge !== null;
  /** Grease or descale past its interval (Stats → Piston health): one line on the idle screen */
  const [maintenanceDue, setMaintenanceDue] = useState<MaintenanceCount[]>([]);
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
  /** The readouts row: the rating popup leaves it undimmed (the pressure tells when the portafilter can come off) */
  const readoutsRef = useRef<HTMLDivElement>(null);
  const [rateTop, setRateTop] = useState(0);

  const { notices, noticeBusy, respondToNotice, onSocketNotice, showDemoNotice } = useMachineNotices(setError);
  const {
    connected, status, statusRef, preheatLeft, data, setData, grav, heatSamples, setHeatSamples,
    preShot, setTemp, setSetTemp, elapsed, setElapsed, autoFiredRef, pistonPos, setPistonPos,
  } = useMachineLive({ onNotice: onSocketNotice, setError, setBusy, setTargetWeight, autoBrewRef, startedAtRef, onAutoBrewUsed: () => setAutoBrew(false) });
  const { grinderLink, linkRef, connectGrinder, toggleGrinder, live: grinderLive } =
    useGrinder({ grinder: recipe.grinder, setRecipe, setError, demo });
  const { difluid, deviceTds, measuring: difluidMeasuring, noReply: difluidNoReply, difluidTap } = useDifluid(setError);
  const brewing = isExtracting(status);
  const purging = demoPurge !== null || isPurging(status);
  // The piston panel shows the pressure coming down to rest (lib/station/use-purge-release.ts)
  const pressureNow = demoPurge !== null ? demoPressure : readingsOf(status).pressure ?? null;
  const { settling, homing, releaseFrom } = usePurgeRelease({ status, purging, pressureNow, pistonPos, demoPurge });
  // Anonymous count of Stations connected to a machine today (see lib/usage.ts)
  useEffect(() => {
    if (!connected) return;
    void countUse("s");
    // Different machines: only a short code that can't be turned back into the serial (lib/usage.ts)
    if (counting() && !machineCounted()) getMachineInfo().then((m) => countMachine(m.serial)).catch(() => {});
  }, [connected]);
  const { recentShots, nextPlan, setNextPlan, rateOpen, setRateOpen, showRecent, saveRating, lastFacts, lastCup, unrated, rateUnrated, skipRating } =
    useShotRecord({
      demo, profiles, recipe, brewing, data, linkRef, setError,
      // The machine is waiting for the purge tap after the shot
      purgeAsked: !brewing && isPurgeWait(status),
      // Auto purge, or a shot that ends with no purge: the rating still opens
      purging: isPurging(status),
      idle: !!status && isIdle(status),
    });

  /** This tablet's measured shots (TDS / EY in the notes), for the TDS estimate; read again after each shot */
  const [eyRefs, setEyRefs] = useState<EyReference[]>([]);
  useEffect(() => {
    if (!getSavedIp() || new URLSearchParams(window.location.search).has("demo")) return;
    let alive = true;
    getHistoryLight(300).then((h) => { if (alive) setEyRefs(eyReferences(h.map((s) => shotSummary(s)))); }).catch(() => {});
    return () => { alive = false; };
  }, [rateOpen]);


  // Shots since the last grease and descale, from the machine's list of shots (light: no curves);
  // again after each new shot
  const newestShot = recentShots?.[0]?.dbKey;
  useEffect(() => {
    if (!getSavedIp() || new URLSearchParams(window.location.search).has("demo")) return;
    let alive = true;
    // Only the newest shots are read: the rest are kept on the tablet
    getShotTimes()
      .then((times) => {
        if (alive) setMaintenanceDue(maintenanceCounts(times, listMaintenance(), loadIntervals()).filter((c) => c.due));
      })
      .catch(() => { /* the line just doesn't show */ });
    return () => { alive = false; };
  }, [newestShot]);

  useEffect(() => {
    // Saved recipe lives in localStorage, read after mount to match the static HTML
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the tablet's saved recipe once, after the page loads
    setRecipe(loadRecipe());
    // /station/?demo…: an offline preview (lib/station/use-station-demo.ts)
    const demoParam = new URLSearchParams(window.location.search).get("demo");
    if (demoParam === "notice") showDemoNotice();
    if (demoParam === "rate" || demoParam === "purge-rate") setRateOpen(true);
    applyDemo(demoParam, {
      setDemo, setDemoHeat, setDemoPurge, setDemoPour, setDemoEnd, setHeatSamples, setSetTemp, setTargetWeight, setData, setElapsed,
    });
    if (!getSavedIp()) return;
    loadProfiles();

  // Runs once: the hooks' setters it calls don't change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rateOpen) return;
    const measure = () => setRateTop(Math.round(readoutsRef.current?.getBoundingClientRect().bottom ?? 0));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rateOpen]);



  // The ?demo=purge piston and the ?demo=pour shot, played without the machine
  useStationDemoPlayback({ demoPurgeOn, setDemoPurge, setDemoPressure, setPistonPos, demoPour, setDemoPour, setData, setElapsed, setDemoEnd });

  const baseProfile = pickBaseProfile(profiles, recipe.baseProfileId);

  /** The machine's profiles, in the dial's order (Settings → Profile order); read only */
  function loadProfiles() {
    Promise.all([listProfiles(), getSettings().catch(() => null)])
      .then(([list, settings]) => setProfiles(sortByMachineOrder(list, settings?.profile_order)))
      .catch((e) => setError(explainError(e, "Couldn't read the profiles")));
  }

  function updateRecipe(patch: Partial<Recipe>) {
    setRecipe((r) => {
      const next = { ...r, ...patch };
      saveRecipe(next);
      return next;
    });
  }

  async function run(action: ActionType) {
    if (action === "continue" && isClickToStart(statusRef.current)) {
      autoFiredRef.current = true;
    }
    setBusy(action);
    setError(null);
    try {
      const before = statusRef.current?.name;
      await executeAction(action);
      refreshNow();
      // Keep the buttons locked until the machine shows the change (or 2 s), so a second tap
      // can't send the same command again
      if (action !== "tare") {
        const t0 = Date.now();
        await new Promise<void>((done) => {
          const id = setInterval(() => {
            if (statusRef.current?.name !== before || Date.now() - t0 > 2000) { clearInterval(id); done(); }
          }, 100);
        });
      }
    } catch (e) {
      setError(explainError(e, actionWord(action)));
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
      setError(explainError(e, `Couldn't start ${baseProfile.name}`));
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
      // Without curves, except the coffee's last shots that the idle list shows
      const history = await getHistoryPicked(60, (light) => pickRecentShots(name, light));
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
      setError(explainError(e, "Couldn't read the shot history"));
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
  const sensors: Readings = demoEnd
    ? { pressure: demoEnd.pressure ?? 0, flow: 0, weight: demoEnd.weight ?? undefined, temp: demoEnd.temp ?? undefined }
    : readingsOf(status);
  const tempTarget = status?.setpoints?.temperature ?? null;
  const online = connected && !!status;
  // The machine hasn't answered for 8 s: say why and how to fix it, in the chart's place
  const [offlineLong, setOfflineLong] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the machine's live state (an outside system)
    if (online || demo || !getSavedIp()) { setOfflineLong(false); return; }
    const id = setTimeout(() => setOfflineLong(true), 8000);
    return () => clearTimeout(id);
  }, [online, demo]);
  // Back online: a connection error on screen is old news; the profiles come if they never did
  const wasOnlineRef = useRef(false);
  useEffect(() => {
    if (online && !wasOnlineRef.current) {
      setError((e) => (e && /reach the machine|didn't answer|Connection/i.test(e) ? null : e));
      if (profiles.length === 0 && !demo) loadProfiles();
      // Its network name, for "Find machine" (read only)
      if (!demo && !getSavedHostname()) getMachineInfo().then((i) => saveHostname(i.hostname)).catch(() => {});
    }
    wasOnlineRef.current = online;
  // loadProfiles only uses setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  /** During heating and the shot, Stop is the control that matters: give it the big slot */
  const stopFirst = brewing || heating;
  /** Idle: nothing to stop, so Stop stays visible but small */
  const stopQuiet = !!status && idle && !stopFirst;

  // ── Main button follows the flow (lib/station/main-button.ts) ──
  const main = mainButton({
    status, connected, hasProfile: !!baseProfile, elapsedText: fmtClock(elapsed),
    recipeHint: `${recipe.dose}g · ${formatRatio(recipe.ratio)} · ${beverageWeight(recipe)}g · ${recipe.temperature}°C · ${retractionFor(recipe)} ml${overCapacity(recipe) ? ` · ⚠ max ~${maxYieldFor(recipe.dose)} g` : ""}`,
  });
  const mainAction = main.action;
  const mainLabel = main.label;
  const mainHint = main.hint;
  const tone = main.tone;
  const MainIcon: React.ElementType = { play: Play, spinner: Loader2, water: Droplets, flame: Flame }[main.icon];

  const toneClass = {
    start: "bg-[var(--primary)] text-[var(--on-primary)]",
    water: "bg-[var(--water)] text-[var(--paper)] animate-pulse",
    brew: "bg-[var(--primary)] text-[var(--on-primary)] animate-pulse",
    heat: "border border-[var(--heat)]/40 bg-[var(--heat)]/10 text-[var(--heat)]",
    busy: "border border-[var(--ink)]/30 bg-[var(--ink)]/[0.06] text-[var(--accent)]",
    off: "bg-[var(--ink)]/[0.05] text-[var(--ink)]/70",
  }[tone];

  /** The piston while the machine purges: in the chart's place, and beside the rating popup */
  const pistonProps = {
    // After the purge the piston is back at the top
    position: settling ? 0 : pistonPos, home: homing, settling, pressure: pressureNow, releaseFrom,
  };
  /** The piston panel: through the purge, and after it until the pressure rests */
  const pistonPanel = purging || settling;

  /** The cup filling with the scale's weight, up to the target line */
  const glass = (
    <EspressoGlass weight={data[data.length - 1]?.weight} scale={sensors.weight} target={targetWeight}
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

      {/* In Chrome's tab the Station loses the top of the screen: offer the app, only while idle */}
      {idle && !rateOpen && <InstallHint />}
      {/* Newer firmware on the machine's channel, or a company update not seen yet */}
      {idle && !rateOpen && online && <NewsLine />}
      {/* A shot that ended without a rating (the page reloaded, the tablet slept): rate it now */}
      {idle && !rateOpen && online && unrated && (
        <button type="button" onClick={rateUnrated}
          className="flex shrink-0 items-center gap-3 rounded-md border-2 border-[var(--accent)] bg-[var(--primary)]/15 px-3 py-2 text-left text-sm active:scale-[0.99]">
          <Smile className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="min-w-0 flex-1"><b>Rate last shot</b> · the {timeHM(unrated.startedAt)} shot has no rating yet</span>
          <span className="shrink-0 rounded-md bg-[var(--primary)] px-3 py-1.5 font-semibold text-[var(--on-primary)]">Rate</span>
        </button>
      )}

      {rateOpen && (() => {
        const last = data[data.length - 1];
        // The cup once the machine saved the shot (last drops in), else the last reading
        const w = lastCup ?? last?.weight ?? 0;
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
          tdsEstimate={estimateTds({ coffee: recipe.coffee, dose: recipe.dose, ratio: recipe.ratio, cupWeight: w, grind: recipe.grindUm ?? recipe.grindSetting ?? null, seconds: last ? last.t / 1000 : null, barDown: data.find((d) => typeof d.barDown === "number")?.barDown ?? null, waterId: currentWaterId() }, eyRefs)}
          top={rateTop}
          aside={pistonPanel ? <PurgePiston {...pistonProps} className="min-h-0 min-w-0 flex-1 gap-3 p-3 landscape:flex-col portrait:gap-6" /> : undefined}
          onSkip={() => { skipRating(); setData([]); }}
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
        <div ref={readoutsRef} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-2 landscape:col-start-1">
          <Readout label="Time" value={brewing || data.length ? fmtClock(elapsed) : "—"} unit="" color="var(--ink)" />
          <Readout label={sensors.weight != null && sensors.weight < -1 && !brewing ? "Weight · tap Tare" : "Weight"}
            value={sensors.weight != null && sensors.weight < -1 && !brewing ? "—" : fmt(sensors.weight)}
            unit={targetWeight ? `/ ${targetWeight} g` : "g"} color={COLORS.weight} />
          <Readout label="Flow" value={fmt(sensors.flow)} unit="ml/s" color={COLORS.flow} />
          {/* Gauge: temperature while heating, pressure otherwise */}
          {tempView ? (
            <TemperatureGauge
              value={demoHeat ? heatSamples[heatSamples.length - 1]?.temp : sensors.temp}
              target={tempTarget ?? setTemp} />
          ) : (
            <PressureGauge value={sensors.pressure} color={COLORS.pressure} />
          )}
        </div>

        {/* Chart */}
        <div className="flex min-h-0 flex-col landscape:col-start-1">
          {offlineLong && !brewing ? (
            <div className="flex min-h-0 flex-1 overflow-y-auto border-t-2 border-[var(--ink)] p-2"><OfflineCard /></div>
          ) : pistonPanel ? (
            <PurgePiston {...pistonProps} />
          ) : (
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
                const finalW = lastCup ?? last.weight ?? 0;
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
            live={{ pressure: sensors.pressure, flow: sensors.flow, grav, weight: sensors.weight, temp: sensors.temp }}
            placeholder={
              tempView ? (
                <HeatingProgress
                  title={needsWater ? "Add water" : waiting ? (isPurgeWait(status) ? "Ready to purge" : "Ready to brew") : "Heating"}
                  titleColor={needsWater ? "var(--water)" : waiting ? "var(--accent)" : "var(--heat)"}
                  hint={needsWater ? "Pour the water, then tap Water added"
                    : waiting ? (isPurgeWait(status) ? "Tap Purge to continue"
                      : autoBrew ? "Auto brew is on: brewing now" : "Tap Brew when you're ready")
                    : "Prep the puck and cup"}
                  samples={heatSamples}
                  target={tempTarget ?? setTemp}
                  current={heatSamples[heatSamples.length - 1]?.temp ?? sensors.temp ?? null}
                />
              ) : needsWater ? (
                <p className="text-2xl font-semibold text-[var(--water)]">Pour the water, then tap “Water added”</p>
              ) : waiting ? (
                <p className="text-2xl font-semibold text-[var(--accent)]">{isPurgeWait(status) ? "Ready — tap Purge" : "Ready — tap Brew"}</p>
              ) : (
                // Idle: the last shots of the coffee, and the temperature in one line
                <RecentShots key={`${recipe.coffee ?? ""}|${recentShots?.[0]?.dbKey ?? recentShots?.length ?? "-"}`}
                  coffee={recipe.coffee} shots={recentShots} temp={sensors.temp} plan={nextPlan}
                  profileTip={baseProfile ? { name: baseProfile.name, tips: profileTips(baseProfile.display?.description) } : null}
                  maintenanceDue={maintenanceDue} />
              )
            }
          />
          )}
        </div>

        {/* Controls */}
        <div className={`grid min-h-0 gap-2 sm:gap-2.5 ${stopQuiet ? "grid-cols-[4fr_1fr]" : "grid-cols-[2fr_1fr]"} grid-rows-[auto_auto_auto] landscape:col-start-2 landscape:row-start-1 landscape:row-span-2 landscape:grid-cols-1 landscape:grid-rows-[auto_minmax(0,1fr)_auto_auto]`}>
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
            className={`${stopFirst ? "order-2 min-h-[84px] text-3xl" : stopQuiet ? "order-3 min-h-11 text-base" : "order-3 min-h-[56px]"} flex items-center justify-center gap-2.5 rounded-md border-2 border-[var(--stop)] bg-transparent text-xl font-bold text-[var(--stop)] active:scale-[0.98] disabled:opacity-30`}
          >
            {busy === "stop" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Square className="h-5 w-5" fill="currentColor" />}
            Stop
          </button>

          {/* Same controls as the machine's own web UI */}
          <div className="order-4 grid grid-cols-4 gap-2 portrait:col-span-2">
            <SmallButton icon={Scale} label="Tare" busy={busy === "tare"}
              // Not during the shot: zeroing the scale mid-shot would throw the weight stop off
              disabled={!online || busy !== null || brewing} onClick={() => run("tare")} />
            <SmallButton icon={Wind} label="Purge" busy={busy === "purge"}
              disabled={!online || !idle || busy !== null} onClick={() => run("purge")} />
            <SmallButton icon={ArrowUpToLine} label="Raise piston" busy={busy === "home"}
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
