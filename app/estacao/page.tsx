"use client";

/**
 * Station — full-screen bar station for a tablet next to the machine
 * (sized for a Galaxy Tab A 10.1, ~800×1280 CSS px, either orientation).
 * Everything fits on one screen: no scrolling.
 *
 * Flow: pick profile, dose, ratio and temperature → Start shot (loads the
 * profile with that temperature and yield, unsaved; the machine then heats,
 * like the official "Start shot") → Water added / Brew when the machine waits
 * for a click (`continue`, like the dial's button).
 * Small controls match the machine's own web UI: Tare, Purge, Raise (home),
 * Preheat (toggle).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowUpToLine, Droplets, Flame, Heater, Loader2, Maximize, Minimize, Minus, Play,
  Plus, Scale, Square, Wind,
} from "lucide-react";
import { ShotCharts, COLORS, type ShotPoint } from "@/components/estacao-charts";
import { ProfilePicker } from "@/components/profile-picker";
import { demoShot } from "@/lib/demo-shot";
import { connectSocket, disconnectSocket, refreshNow } from "@/lib/machine-socket";
import { executeAction, getSettings, listProfiles, loadProfileInline } from "@/lib/machine-api";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import {
  isExtracting, isHeating, isIdle, isWaitingForUser, isWaitingForWater,
} from "@/lib/brew-state";
import {
  type Recipe, DEFAULT_RECIPE, LIMITS, RATIO_PRESETS, beverageWeight, buildShotProfile, formatRatio,
  loadRecipe, pickBaseProfile, roundTo, saveRecipe, sortByMachineOrder,
} from "@/lib/recipe";
import type { ActionType, LiveStatus, Profile } from "@/lib/types";

/** Gravimetric flow (g/s) from the last ~1 s of scale readings (fallback only). */
function gravFlow(samples: { t: number; w: number }[]): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const first = samples.find((x) => last.t - x.t <= 1200) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.3) return null;
  return Math.max(0, (last.w - first.w) / dt);
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  heating: "Heating",
  "click to start": "Ready to brew",
  "pour water and click to continue": "Add water",
  "click to purge": "Ready to purge",
  purge: "Purging",
  home: "Raising",
  retracting: "Retracting",
  "closing valve": "Closing valve",
  "starting...": "Starting",
};

function statusLabel(s: LiveStatus | null, connected: boolean): string {
  if (!connected) return "Connecting…";
  if (!s) return "Waiting for machine…";
  if (isExtracting(s)) return s.name ? `Brewing · ${s.name}` : "Brewing";
  return STATUS_LABELS[(s.name ?? "").toLowerCase()] ?? s.name ?? "—";
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

// ── Keep the tablet screen on, and the page from scrolling ─────────────────────

function useStationScreen() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (!nav.wakeLock) return;
      try {
        const l = await nav.wakeLock.request("screen");
        if (cancelled) l.release().catch(() => {});
        else lock = l;
      } catch { /* not allowed (e.g. page hidden) — retried on visibility */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
      [html.style.overflow, document.body.style.overflow] = prev;
    };
  }, []);
}

export default function StationPage() {
  useRequireConnection();
  useStationScreen();

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [preheatLeft, setPreheatLeft] = useState(0);
  const [data, setData] = useState<ShotPoint[]>([]);
  const [grav, setGrav] = useState<number | null>(null);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<ActionType | "load" | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recipe, setRecipe] = useState<Recipe>(DEFAULT_RECIPE);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const weightSamplesRef = useRef<{ t: number; w: number }[]>([]);
  const shotStartRef = useRef<number | null>(null);
  /** Whether this shot's x axis follows the machine's clock (decided at shot start). */
  const machineClockRef = useRef(false);

  useEffect(() => {
    // Saved recipe lives in localStorage, read after mount to match the static HTML
    setRecipe(loadRecipe());
    // /estacao/?demo shows a simulated shot to preview the chart
    if (new URLSearchParams(window.location.search).has("demo")) {
      const pts = demoShot();
      setDemo(true);
      setData(pts);
      setTargetWeight(40);
      setElapsed(pts[pts.length - 1].t / 1000);
    }
    if (!getSavedIp()) return;
    // Same order as the dial (Settings → Profile order); read only
    Promise.all([listProfiles(), getSettings().catch(() => null)])
      .then(([list, settings]) => setProfiles(sortByMachineOrder(list, settings?.profile_order)))
      .catch((e) => setError(`Couldn't read profiles: ${e instanceof Error ? e.message : e}`));
  }, []);

  const baseProfile = pickBaseProfile(profiles, recipe.baseProfileId);

  function updateRecipe(patch: Partial<Recipe>) {
    setRecipe((r) => {
      const next = { ...r, ...patch };
      saveRecipe(next);
      return next;
    });
  }

  useEffect(() => {
    if (!getSavedIp()) return;
    connectSocket({
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
      error: () => setConnected(false),
      heater: (sec) => setPreheatLeft(sec),
      status: (s) => {
        setStatus(s);
        setConnected(true);
        const now = Date.now();
        const w = s.sensors?.w;
        if (w != null) {
          weightSamplesRef.current = [...weightSamplesRef.current, { t: now, w }].filter((x) => now - x.t <= 3000);
        }
        // Machine's own gravimetric flow; estimate it only if absent
        const g = isExtracting(s) ? (s.sensors?.g ?? gravFlow(weightSamplesRef.current)) : null;
        setGrav(g);

        if (isExtracting(s)) {
          if (shotStartRef.current == null) {
            // New shot: start a fresh chart
            shotStartRef.current = now;
            // Trust the machine's shot clock only if it restarted with this shot
            machineClockRef.current = typeof s.time === "number" && s.time >= 0 && s.time < 3000;
            setData([]);
          }
          const t = machineClockRef.current && typeof s.time === "number" ? s.time : now - shotStartRef.current;
          setElapsed(t / 1000);
          setData((prev) => [
            ...prev.slice(-900),
            {
              t,
              pressure: s.sensors?.p ?? null,
              flow: s.sensors?.f ?? null,
              grav: g,
              weight: w != null && w > 0 ? w : null,
              temp: s.sensors?.t ?? null,
              stage: s.name ?? null,
              pTarget: s.setpoints?.pressure ?? null,
              fTarget: s.setpoints?.flow ?? null,
            },
          ]);
        } else if (shotStartRef.current != null) {
          // Shot ended: keep the chart and final time on screen until the next one
          shotStartRef.current = null;
        }
      },
    }).catch((e) => { setConnected(false); setError(String(e)); });
    return () => { disconnectSocket(); };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function run(action: ActionType) {
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
      await loadProfileInline(buildShotProfile(baseProfile, recipe));
      setTargetWeight(beverageWeight(recipe));
      updateRecipe({ baseProfileId: baseProfile.id });
      refreshNow();
    } catch (e) {
      setError(`Couldn't start ${baseProfile.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  const brewing = isExtracting(status);
  const needsWater = isWaitingForWater(status);
  const waiting = isWaitingForUser(status) && !needsWater;
  const heating = isHeating(status);
  const idle = isIdle(status);
  const preheating = preheatLeft > 0;
  const sensors = status?.sensors;
  const tempTarget = status?.setpoints?.temperature ?? null;
  const online = connected && !!status;

  // ── Main button follows the flow ──
  // idle → Start shot · heating → progress · water → Water added · ready → Brew
  let mainAction: ActionType | "load" | null = null;
  let mainLabel = "Start shot";
  let mainHint = baseProfile
    ? `${recipe.dose}g · ${formatRatio(recipe.ratio)} · ${beverageWeight(recipe)}g · ${recipe.temperature}°C`
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
    start: "bg-[#e8944a] text-[#0c0a09] shadow-[0_4px_40px_rgba(232,148,74,0.3)]",
    water: "bg-[#6cc7f0] text-[#0c0a09] shadow-[0_0_50px_rgba(108,199,240,0.35)] animate-pulse",
    brew: "bg-[#4ade80] text-[#0c0a09] shadow-[0_0_50px_rgba(74,222,128,0.35)] animate-pulse",
    heat: "border border-[#e8944a]/30 bg-[#e8944a]/10 text-[#e8944a]",
    busy: "border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]",
    off: "bg-white/[0.06] text-[#f5f0ea]/50",
  }[tone];

  const pillColor =
    !connected ? "bg-white/[0.06] text-[#f5f0ea]/50"
    : brewing || waiting ? "bg-[#4ade80]/15 text-[#4ade80]"
    : needsWater ? "bg-[#6cc7f0]/15 text-[#6cc7f0]"
    : heating || preheating ? "bg-[#e8944a]/15 text-[#e8944a]"
    : "bg-white/[0.06] text-[#f5f0ea]/70";

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex flex-col gap-2 overflow-hidden bg-[#0c0a09] p-2.5 text-[#f5f0ea] select-none sm:gap-2.5 sm:p-3"
      style={{ height: "100dvh" }}
    >
      {/* ── Top bar ── */}
      <header className="flex shrink-0 items-center gap-2.5">
        <Link href="/dashboard" aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-[#f5f0ea]/60 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{status?.loaded_profile ?? "—"}</p>
        <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${pillColor}`}>
          <span className={`h-2 w-2 rounded-full bg-current ${brewing || heating || waiting || needsWater || preheating ? "animate-pulse" : ""}`} />
          {preheating && idle ? `Preheating ${fmtClock(preheatLeft)}` : statusLabel(status, connected)}
        </span>
        <button onClick={toggleFullscreen} aria-label="Full screen"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] text-[#f5f0ea]/60 active:scale-95">
          {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </header>

      {error && (
        <button onClick={() => setError(null)}
          className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-left text-sm text-red-300">
          {error} <span className="text-red-300/50">· tap to dismiss</span>
        </button>
      )}

      {/* ── Body: side by side in landscape, stacked in portrait ── */}
      <div className="grid min-h-0 flex-1 gap-2 sm:gap-2.5 grid-rows-[auto_minmax(0,1fr)_auto] landscape:grid-rows-[auto_minmax(0,1fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(280px,31%)]">
        {/* Readouts */}
        <div className="grid grid-cols-3 gap-2 landscape:col-start-1">
          <Readout label="Time" value={brewing || data.length ? fmtClock(elapsed) : "—"} unit="" color="#f5f0ea" />
          <Readout label="Weight" value={fmt(sensors?.w)} unit={targetWeight ? `/ ${targetWeight} g` : "g"} color={COLORS.weight} />
          <Readout label="Temperature" value={fmt(sensors?.t)}
            unit={tempTarget != null ? `/ ${tempTarget} °C` : "°C"} color={COLORS.temp} />
        </div>

        {/* Chart */}
        <div className="flex min-h-0 flex-col landscape:col-start-1">
          <ShotCharts
            data={data}
            targetWeight={targetWeight}
            currentStage={demo ? "Pressure Decline" : brewing ? status?.name ?? null : null}
            live={{ pressure: sensors?.p, flow: sensors?.f, grav, weight: sensors?.w, temp: sensors?.t }}
            placeholder={
              heating ? (
                <>
                  <Flame className="h-10 w-10 animate-pulse text-[#e8944a]" />
                  <p className="text-2xl font-semibold text-[#e8944a]">
                    Heating{tempTarget != null && sensors?.t != null ? ` · ${sensors.t.toFixed(0)} → ${tempTarget} °C` : ""}
                  </p>
                  <p className="text-base">Prep the puck and cup</p>
                </>
              ) : needsWater ? (
                <p className="text-2xl font-semibold text-[#6cc7f0]">Pour the water, then tap “Water added”</p>
              ) : waiting ? (
                <p className="text-2xl font-semibold text-[#4ade80]">Ready — tap Brew</p>
              ) : (
                <p className="text-lg">The chart shows up when extraction starts</p>
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
            editable={idle && online && busy === null}
            onChange={updateRecipe}
          />

          <button
            onClick={() => mainAction === "load" ? startShot() : mainAction && run(mainAction)}
            disabled={!mainAction || busy !== null}
            className={`flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-[0.98] disabled:active:scale-100 ${toneClass}`}
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

          <button
            onClick={() => run("stop")}
            disabled={!online || idle || busy !== null}
            className="flex min-h-[56px] items-center justify-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/15 text-xl font-bold text-red-300 active:scale-[0.98] disabled:opacity-30"
          >
            {busy === "stop" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Square className="h-5 w-5" fill="currentColor" />}
            Stop
          </button>

          {/* Same controls as the machine's own web UI */}
          <div className="grid grid-cols-4 gap-2 portrait:col-span-2 landscape:grid-cols-2">
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

function Readout({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161210] px-3 py-1.5">
      <p className="text-[11px] uppercase tracking-wider text-[#f5f0ea]/40">{label}</p>
      <p className="font-mono text-[clamp(1.3rem,3vmax,2.25rem)] font-bold leading-tight whitespace-nowrap" style={{ color }}>
        {value}
        {unit && value !== "—" && <span className="ml-1 text-sm font-medium text-[#f5f0ea]/40">{unit}</span>}
      </p>
    </div>
  );
}

function SmallButton({
  icon: Icon, label, onClick, disabled, busy, active,
}: {
  icon: React.ElementType; label: string; onClick: () => void; disabled: boolean; busy: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={active ? "Preheating. Tap to stop." : undefined}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-semibold transition-all active:scale-95 disabled:opacity-30 ${
        active
          ? "border-[#e8944a]/50 bg-[#e8944a]/15 text-[#e8944a]"
          : "border-white/[0.08] bg-[#161210] text-[#f5f0ea]/80"
      }`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className={`h-5 w-5 ${active ? "animate-pulse" : ""}`} />}
      {label}
    </button>
  );
}

function RecipePanel({
  profiles, base, recipe, editable, onChange,
}: {
  profiles: Profile[]; base: Profile | null; recipe: Recipe; editable: boolean;
  onChange: (patch: Partial<Recipe>) => void;
}) {
  return (
    <div className="portrait:col-span-2 space-y-2 rounded-2xl border border-white/[0.06] bg-[#161210] p-2.5">
      <ProfilePicker
        profiles={profiles}
        selected={base}
        disabled={!editable}
        onSelect={(id) => onChange({ baseProfileId: id })}
      />
      <div className="grid grid-cols-3 gap-2 landscape:grid-cols-1 landscape:gap-1.5">
        <Stepper label="Dose" unit="g" value={recipe.dose} limits={LIMITS.dose} disabled={!editable}
          format={(v) => v.toFixed(1).replace(/\.0$/, "")}
          onChange={(dose) => onChange({ dose })} />
        <Stepper label="Ratio" unit={`= ${beverageWeight(recipe)}g`} value={recipe.ratio} limits={LIMITS.ratio} disabled={!editable}
          format={(v) => formatRatio(v)}
          onChange={(ratio) => onChange({ ratio })} />
        <Stepper label="Temp" unit="°C" value={recipe.temperature} limits={LIMITS.temperature} disabled={!editable}
          format={(v) => v.toFixed(1).replace(/\.0$/, "")}
          onChange={(temperature) => onChange({ temperature })} />
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {RATIO_PRESETS.map((r) => {
          const on = Math.abs(recipe.ratio - r) < 0.001;
          return (
            <button key={r} disabled={!editable} onClick={() => onChange({ ratio: r })}
              className={`h-9 rounded-lg border text-sm font-bold transition-all active:scale-95 disabled:opacity-40 ${
                on
                  ? "border-[#e8944a] bg-[#e8944a] text-[#0c0a09]"
                  : "border-white/[0.08] bg-[#0c0a09] text-[#f5f0ea]/75"
              }`}>
              {formatRatio(r)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stepper({
  label, unit, value, limits, disabled, format, onChange,
}: {
  label: string; unit: string; value: number; disabled: boolean;
  limits: { min: number; max: number; step: number };
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(roundTo(Math.min(limits.max, Math.max(limits.min, v)), limits.step));
  const btn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0c0a09] text-[#f5f0ea]/80 active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} disabled={disabled || value <= limits.min} onClick={() => set(value - limits.step)} aria-label={`Decrease ${label}`}>
        <Minus className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-[#f5f0ea]/40">{label}</p>
        <p className="font-mono text-lg font-bold whitespace-nowrap">
          {format(value)} <span className="text-xs font-medium text-[#f5f0ea]/45">{unit}</span>
        </p>
      </div>
      <button className={btn} disabled={disabled || value >= limits.max} onClick={() => set(value + limits.step)} aria-label={`Increase ${label}`}>
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
