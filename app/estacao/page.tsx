"use client";

/**
 * Estação — full-screen bar station for a tablet next to the machine
 * (sized for a Galaxy Tab A 10.1, ~1280×800 CSS px, either orientation).
 *
 * Flow it is built around: pick profile, dose, ratio and temperature →
 * Aquecer (loads the profile with that temperature and yield, unsaved) →
 * prep puck and cup → Extrair when watching (`continue` on PUSH TO BREW).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Flame, Scale, Wind, Play, Square, Loader2, Maximize, Minimize, Minus, Plus, Droplets,
} from "lucide-react";
import { ShotCharts, COLORS, type ShotPoint } from "@/components/estacao-charts";
import { demoShot } from "@/lib/demo-shot";
import { ProfilePicker } from "@/components/profile-picker";
import { connectSocket, disconnectSocket, refreshNow } from "@/lib/machine-socket";
import { executeAction, listProfiles, loadProfileInline } from "@/lib/machine-api";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import {
  isExtracting, isHeating, isIdle, isWaitingForUser, isWaitingForWater, playAction,
} from "@/lib/brew-state";
import {
  type Recipe, DEFAULT_RECIPE, LIMITS, beverageWeight, buildShotProfile, formatRatio, loadRecipe,
  pickBaseProfile, roundTo, saveRecipe,
} from "@/lib/recipe";
import type { ActionType, LiveStatus, Profile } from "@/lib/types";

/** Gravimetric flow (g/s) from the last ~1 s of scale readings. */
function gravFlow(samples: { t: number; w: number }[]): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const first = samples.find((x) => last.t - x.t <= 1200) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.3) return null;
  return Math.max(0, (last.w - first.w) / dt);
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Pronta",
  heating: "Aquecendo",
  "click to start": "Pronta para extrair",
  "pour water and click to continue": "Coloque água e aperte",
  purge: "Purgando",
  home: "Voltando",
  retracting: "Recolhendo",
  "closing valve": "Fechando válvula",
  "starting...": "Iniciando",
};

function statusLabel(s: LiveStatus | null, connected: boolean): string {
  if (!connected) return "Conectando…";
  if (!s) return "Aguardando máquina…";
  if (isExtracting(s)) return s.name ? `Extraindo · ${s.name}` : "Extraindo";
  return STATUS_LABELS[(s.name ?? "").toLowerCase()] ?? s.name ?? "—";
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

// ── Screen wake lock: keep the tablet on while this page is open ───────────────

function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await nav.wakeLock!.request("screen");
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
    };
  }, []);
}

export default function EstacaoPage() {
  useRequireConnection();
  useWakeLock();

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [heaterLeft, setHeaterLeft] = useState<number | null>(null);
  const [data, setData] = useState<ShotPoint[]>([]);
  const [grav, setGrav] = useState<number | null>(null);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const weightSamplesRef = useRef<{ t: number; w: number }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<ActionType | "heat" | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recipe, setRecipe] = useState<Recipe>(DEFAULT_RECIPE);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const shotStartRef = useRef<number | null>(null);
  /** Whether this shot's x axis follows the machine's clock (decided at shot start). */
  const machineClockRef = useRef(false);
  const statusRef = useRef<LiveStatus | null>(null);

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
    listProfiles()
      .then((list) => setProfiles([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(`Não consegui ler os perfis: ${e instanceof Error ? e.message : e}`));
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
      heater: (sec) => setHeaterLeft(sec),
      status: (s) => {
        setStatus(s);
        statusRef.current = s;
        setConnected(true);
        // Gravimetric flow from recent scale readings
        const now = Date.now();
        const w = s.sensors?.w;
        if (w != null) {
          const samples = [...weightSamplesRef.current, { t: now, w }].filter((x) => now - x.t <= 3000);
          weightSamplesRef.current = samples;
        }
        // Prefer the machine's own gravimetric flow; estimate it only if absent
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
          // Machine's shot clock when available (matches the official app)
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
        if (!isHeating(s)) setHeaterLeft(null);
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** Load the base profile with this recipe (not saved) and start heating. */
  async function heatWithRecipe() {
    if (!baseProfile) return;
    setBusy("heat");
    setError(null);
    try {
      await loadProfileInline(buildShotProfile(baseProfile, recipe));
      setTargetWeight(beverageWeight(recipe));
      updateRecipe({ baseProfileId: baseProfile.id });
      // Loading may already start the heating stage; if the machine is still
      // idle shortly after, ask it to preheat with the profile just loaded.
      await new Promise((r) => setTimeout(r, 1500));
      refreshNow();
      await new Promise((r) => setTimeout(r, 700));
      if (isIdle(statusRef.current)) await executeAction("preheat");
      refreshNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
  const sensors = status?.sensors;
  const tempTarget = status?.setpoints?.temperature ?? null;

  // ── Main button: one button that follows the flow ──
  // idle → Aquecer (preheat) · heating → countdown · waiting → Extrair (continue)
  let mainAction: ActionType | "heat" | null = null;
  let mainLabel = "Aquecer";
  let mainHint = baseProfile
    ? `${recipe.dose}g · ${formatRatio(recipe.ratio)} · ${beverageWeight(recipe)}g · ${recipe.temperature}°C`
    : "escolha um perfil";
  let MainIcon: React.ElementType = Flame;
  if (!connected || !status) { mainLabel = "Conectando"; mainHint = "aguardando a máquina"; MainIcon = Loader2; }
  else if (needsWater) { mainAction = "continue"; mainLabel = "Água colocada"; mainHint = "Coloque a água e aperte para continuar"; MainIcon = Droplets; }
  else if (waiting) { mainAction = playAction(status); mainLabel = "Extrair"; mainHint = "Máquina pronta"; MainIcon = Play; }
  else if (heating) {
    mainLabel = "Aquecendo";
    mainHint = heaterLeft != null
      ? `faltam ${fmtClock(heaterLeft)} · prepare o puck`
      : tempTarget != null && sensors?.t != null
      ? `${sensors.t.toFixed(1)} → ${tempTarget} °C · prepare o puck`
      : "prepare o puck e a xícara";
  } else if (brewing) { mainLabel = "Extraindo"; mainHint = fmtClock(elapsed); MainIcon = Play; }
  else if (idle) { mainAction = baseProfile ? "heat" : null; }
  else { mainLabel = statusLabel(status, connected); mainHint = ""; MainIcon = Loader2; }

  const pillColor =
    !connected ? "bg-white/[0.06] text-[#f5f0ea]/50"
    : brewing ? "bg-[#4ade80]/15 text-[#4ade80]"
    : needsWater ? "bg-[#6cc7f0]/15 text-[#6cc7f0]"
    : waiting ? "bg-[#4ade80]/15 text-[#4ade80]"
    : heating ? "bg-[#e8944a]/15 text-[#e8944a]"
    : "bg-white/[0.06] text-[#f5f0ea]/70";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col gap-3 bg-[#0c0a09] p-3 sm:p-4 text-[#f5f0ea] select-none">
      {/* ── Top bar ── */}
      <header className="flex items-center gap-3 shrink-0">
        <Link href="/dashboard" aria-label="Voltar"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] text-[#f5f0ea]/60 active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-[#f5f0ea]/35">Perfil</p>
          <p className="truncate text-lg font-semibold">{status?.loaded_profile ?? "—"}</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold ${pillColor}`}>
          <span className={`h-2 w-2 rounded-full bg-current ${brewing || heating || waiting || needsWater ? "animate-pulse" : ""}`} />
          {statusLabel(status, connected)}
        </span>
        <button onClick={toggleFullscreen} aria-label="Tela cheia"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] text-[#f5f0ea]/60 active:scale-95">
          {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </header>

      {error && (
        <p className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>
      )}

      {/* ── Body: side-by-side in landscape, stacked in portrait ── */}
      <div className="grid min-h-0 flex-1 gap-3 grid-rows-[auto_minmax(0,1fr)_auto] landscape:grid-rows-[auto_minmax(0,1fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(260px,30%)]">
        {/* Readouts */}
        <div className="grid grid-cols-3 gap-2 landscape:col-start-1">
          <Readout label="Tempo" value={brewing || data.length ? fmtClock(elapsed) : "—"} unit="" color="#f5f0ea" />
          <Readout label="Peso" value={fmt(sensors?.w)} unit={targetWeight ? `/ ${targetWeight} g` : "g"} color={COLORS.weight} />
          <Readout label="Temperatura" value={fmt(sensors?.t)}
            unit={tempTarget != null ? `/ ${tempTarget} °C` : "°C"} color={COLORS.temp} />
        </div>

        {/* Charts */}
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
                    Aquecendo{heaterLeft != null ? ` · ${fmtClock(heaterLeft)}` : ""}
                  </p>
                  <p className="text-base">Prepare o puck e a xícara</p>
                </>
              ) : needsWater ? (
                <p className="text-2xl font-semibold text-[#6cc7f0]">Coloque a água e aperte “Água colocada”</p>
              ) : waiting ? (
                <p className="text-2xl font-semibold text-[#4ade80]">Pronta — aperte Extrair</p>
              ) : (
                <p className="text-lg">O gráfico aparece quando a extração começar</p>
              )
            }
          />
        </div>

        {/* Controls */}
        <div className="grid min-h-0 gap-3 grid-cols-[2fr_1fr] grid-rows-[auto_auto_auto] landscape:col-start-2 landscape:row-start-1 landscape:row-span-2 landscape:grid-cols-1 landscape:grid-rows-[auto_minmax(0,1fr)_auto_auto]">
          <RecipePanel
            profiles={profiles}
            base={baseProfile}
            recipe={recipe}
            editable={idle && connected && busy === null}
            onChange={updateRecipe}
          />

          <button
            onClick={() => mainAction === "heat" ? heatWithRecipe() : mainAction && run(mainAction)}
            disabled={!mainAction || busy !== null}
            className={`flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl transition-all active:scale-[0.98] disabled:active:scale-100 ${
              needsWater
                ? "bg-[#6cc7f0] text-[#0c0a09] shadow-[0_0_50px_rgba(108,199,240,0.35)] animate-pulse"
                : waiting
                ? "bg-[#4ade80] text-[#0c0a09] shadow-[0_0_50px_rgba(74,222,128,0.35)] animate-pulse"
                : mainAction
                ? "bg-[#e8944a] text-[#0c0a09] shadow-[0_4px_40px_rgba(232,148,74,0.3)]"
                : heating
                ? "border border-[#e8944a]/30 bg-[#e8944a]/10 text-[#e8944a]"
                : brewing
                ? "border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
                : "bg-white/[0.06] text-[#f5f0ea]/50"
            }`}
          >
            {busy !== null && busy === mainAction
              ? <Loader2 className="h-12 w-12 animate-spin" />
              : <MainIcon className={`h-12 w-12 ${heating ? "animate-pulse" : ""} ${MainIcon === Loader2 ? "animate-spin" : ""}`}
                  fill={MainIcon === Play ? "currentColor" : "none"} />}
            <span className="text-3xl font-bold">{mainLabel}</span>
            {mainHint && <span className="text-base font-medium opacity-70">{mainHint}</span>}
          </button>

          <button
            onClick={() => run("stop")}
            disabled={!connected || idle || busy !== null}
            className="flex min-h-[72px] items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/15 text-xl font-bold text-red-300 active:scale-[0.98] disabled:opacity-30 portrait:row-span-1"
          >
            {busy === "stop" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Square className="h-6 w-6" fill="currentColor" />}
            Parar
          </button>

          <div className="grid grid-cols-2 gap-3 portrait:col-span-2">
            <SmallButton icon={Scale} label="Tara" busy={busy === "tare"}
              disabled={!connected || busy !== null} onClick={() => run("tare")} />
            <SmallButton icon={Wind} label="Purga" busy={busy === "purge"}
              disabled={!connected || !idle || busy !== null} onClick={() => run("purge")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Readout({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#161210] px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-[#f5f0ea]/40">{label}</p>
      <p className="font-mono text-[clamp(1.4rem,3.4vmax,2.5rem)] font-bold leading-tight whitespace-nowrap" style={{ color }}>
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
    <button onClick={onClick} disabled={disabled}
      className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-base font-semibold transition-all active:scale-95 disabled:opacity-30 ${
        active
          ? "border-[#e8944a]/40 bg-[#e8944a]/15 text-[#e8944a]"
          : "border-white/[0.08] bg-[#161210] text-[#f5f0ea]/80"
      }`}>
      {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className={`h-6 w-6 ${active ? "animate-pulse" : ""}`} />}
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
    <div className="portrait:col-span-2 rounded-2xl border border-white/[0.06] bg-[#161210] p-3 space-y-3">
      <ProfilePicker
        profiles={profiles}
        selected={base}
        disabled={!editable}
        onSelect={(id) => onChange({ baseProfileId: id })}
      />
      <div className="grid grid-cols-3 gap-2 landscape:grid-cols-1">
        <Stepper label="Dose" unit="g" value={recipe.dose} limits={LIMITS.dose} disabled={!editable}
          format={(v) => v.toFixed(1).replace(/\.0$/, "")}
          onChange={(dose) => onChange({ dose })} />
        <Stepper label="Ratio" unit={`= ${beverageWeight(recipe)}g`} value={recipe.ratio} limits={LIMITS.ratio} disabled={!editable}
          format={(v) => formatRatio(v)}
          onChange={(ratio) => onChange({ ratio })} />
        <Stepper label="Temp." unit="°C" value={recipe.temperature} limits={LIMITS.temperature} disabled={!editable}
          format={(v) => v.toFixed(1).replace(/\.0$/, "")}
          onChange={(temperature) => onChange({ temperature })} />
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
  const btn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#0c0a09] text-[#f5f0ea]/80 active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button className={btn} disabled={disabled || value <= limits.min} onClick={() => set(value - limits.step)} aria-label={`Diminuir ${label}`}>
        <Minus className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1 text-center leading-tight">
        <p className="text-[11px] uppercase tracking-wider text-[#f5f0ea]/40">{label}</p>
        <p className="font-mono text-xl font-bold whitespace-nowrap">
          {format(value)} <span className="text-xs font-medium text-[#f5f0ea]/45">{unit}</span>
        </p>
      </div>
      <button className={btn} disabled={disabled || value >= limits.max} onClick={() => set(value + limits.step)} aria-label={`Aumentar ${label}`}>
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
