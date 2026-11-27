"use client";

/**
 * The machine's live feed for the Station: status, the shot chart's points,
 * the heating curve, preheat countdown and gravimetric flow. Also taps Brew
 * once by itself when "Auto brew" is on and the machine is ready.
 */

import { activeTargets } from "@/lib/shot-facts";
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { HeatPoint, ShotPoint } from "@/components/shot-charts";
import { stepHeatRun, type HeatRun } from "@/lib/heat-log";
import { barDownGo, type AutoBrew } from "@/lib/station/auto-brew";
import { getMachineInfo } from "@/lib/machine-api";
import { connectSocket, disconnectSocket, refreshNow } from "@/lib/machine-socket";
import { executeAction, type MachineNotification } from "@/lib/machine-api";
import { getSavedIp } from "@/lib/connection-store";
import { isClickToStart, isExtracting, isHeating, isIdle, isPurging, isWaitingForWater } from "@/lib/brew-state";
import { explainError, gravFlow, groupTempsFor } from "@/lib/station/format";
import { readingsOf } from "@/lib/station/readings";
import type { ActionType, LiveStatus, LiveTemperatures } from "@/lib/types";

export function useMachineLive({
  onNotice, setError, setBusy, setTargetWeight, autoBrewRef, startedAtRef, onAutoBrewUsed,
}: {
  /** Auto brew just tapped Brew: it's for one shot, so the page turns it off */
  onAutoBrewUsed?: () => void;
  /** Machine message pushed over the socket (kept from the first render: use refs and setters only) */
  onNotice: (n: MachineNotification) => void;
  setError: (msg: string | null) => void;
  setBusy: Dispatch<SetStateAction<ActionType | "load" | null>>;
  setTargetWeight: Dispatch<SetStateAction<number | null>>;
  /** Auto brew: off by default and on every page load, on purpose */
  autoBrewRef: MutableRefObject<AutoBrew>;
  /** When this page last sent Start heating (to tell its shots from ones started on the dial) */
  startedAtRef: MutableRefObject<number>;
}) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [preheatLeft, setPreheatLeft] = useState(0);
  const [data, setData] = useState<ShotPoint[]>([]);
  /** Shot points collect here and reach the chart at most ~4×/s (see flush effect). */
  const dataRef = useRef<ShotPoint[]>([]);
  const dataDirtyRef = useRef(false);
  const [grav, setGrav] = useState<number | null>(null);
  const [heatSamples, setHeatSamples] = useState<HeatPoint[]>([]);
  const heatStartRef = useRef<number | null>(null);
  /** The same curve, for the Auto brew check inside the socket handler */
  const heatRef = useRef<HeatPoint[]>([]);
  /** From the first "heating" until extraction starts (or the machine goes idle). */
  const preShotRef = useRef(false);
  const [preShot, setPreShot] = useState(false);
  const autoFiredRef = useRef(false);
  /** Latest group temperatures from the machine's "sensors" event. */
  const groupTempsRef = useRef<Partial<LiveTemperatures>>({});
  /** The piston's position (mm), kept only while the machine purges: it changes several times a second */
  const [pistonPos, setPistonPos] = useState<number | null>(null);
  /** Last temperature target the machine reported (shown as "set" during the shot). */
  const [setTemp, setSetTemp] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const weightSamplesRef = useRef<{ t: number; w: number }[]>([]);
  const shotStartRef = useRef<number | null>(null);
  /** Latest status, for decisions made outside render (manual Brew vs auto brew) */
  const statusRef = useRef<LiveStatus | null>(null);
  /** Whether this shot's x axis follows the machine's clock (decided at shot start). */
  const machineClockRef = useRef(false);

  useEffect(() => {
    // ?demo pages are offline previews: no live data mixed into the fake shot
    if (!getSavedIp() || new URLSearchParams(window.location.search).has("demo")) return;
    const handlers: Parameters<typeof connectSocket>[0] = {
      connect: () => setConnected(true),
      error: () => setConnected(false),
      heater: (sec) => setPreheatLeft(sec),
      disconnect: () => { setConnected(false); setPreheatLeft(0); },
      notification: onNotice,
      temperatures: (g) => {
        groupTempsRef.current = g;
        if (isPurging(statusRef.current) && typeof g.m_pos === "number") setPistonPos(g.m_pos);
      },
      status: (s) => {
        setStatus(s);
        statusRef.current = s;
        if (!isPurging(s)) setPistonPos(null);
        setConnected(true);
        if (s.setpoints?.temperature != null) setSetTemp(s.setpoints.temperature);
        const now = Date.now();
        // The readings, from wherever this machine puts them (see readings.ts)
        const r = readingsOf(s);
        const w = r.weight;
        if (w != null) {
          weightSamplesRef.current = [...weightSamplesRef.current, { t: now, w }].filter((x) => now - x.t <= 3000);
        }
        // Pre-shot session: heating → (water) → ready, until extraction starts
        if (isIdle(s) || isExtracting(s)) {
          preShotRef.current = false;
          if (isIdle(s)) heatStartRef.current = null;
        } else if (!preShotRef.current && (isHeating(s) || isWaitingForWater(s)
            || isClickToStart(s))) {
          preShotRef.current = true;
          autoFiredRef.current = false;
          dataRef.current = [];
          dataDirtyRef.current = true;
          setElapsed(0);
          // Shot started from the dial, not from here: the old target line doesn't apply
          if (now - startedAtRef.current > 60_000) setTargetWeight(null);
        }
        setPreShot(preShotRef.current);

        // Auto brew: tap Brew once when the machine is ready (and, in that mode, the Bar down too),
        // if the user asked for it. Only for a shot this page started (not one started on the dial), and only once
        if (autoBrewRef.current !== "off" && preShotRef.current && !autoFiredRef.current
            && now - startedAtRef.current < 15 * 60_000
            && isClickToStart(s)
            && (autoBrewRef.current === "water" || barDownGo(heatRef.current, s.setpoints?.temperature))) {
          autoFiredRef.current = true;
          autoBrewRef.current = "off";
          onAutoBrewUsed?.();
          setBusy("continue");
          executeAction("continue")
            .then(refreshNow)
            .catch((e) => setError(`Auto brew: ${e instanceof Error ? e.message : e}`))
            .finally(() => setBusy(null));
        }

        // Every thermometer, one point per second
        if (r.temp != null) {
          const temp = r.temp;
          const reading = { temp, ...groupTempsFor(groupTempsRef.current) };
          // Curve for the whole pre-shot session (heating view)
          if (preShotRef.current) {
            if (heatStartRef.current == null) { heatStartRef.current = now; heatRef.current = []; setHeatSamples([]); }
            const t = (now - heatStartRef.current) / 1000;
            const prev = heatRef.current;
            if (!(prev.length && t - prev[prev.length - 1].t < 1)) {
              heatRef.current = [...prev.slice(-1200), { t, ...reading }];
              setHeatSamples(heatRef.current);
            }
          }
        }

        // Machine's own gravimetric flow; estimate it only if absent
        const g = isExtracting(s) ? (r.grav ?? gravFlow(weightSamplesRef.current)) : null;
        setGrav(g);

        if (isExtracting(s)) {
          setPreheatLeft(0);
          if (shotStartRef.current == null) {
            // New shot: start a fresh chart
            shotStartRef.current = now;
            // Trust the machine's shot clock only if it restarted with this shot
            machineClockRef.current = typeof s.time === "number" && s.time >= 0 && s.time < 3000;
            dataRef.current = [];
            dataDirtyRef.current = true;
          }
          const t = machineClockRef.current && typeof s.time === "number" ? s.time : now - shotStartRef.current;
          setElapsed(t / 1000);
          dataRef.current = [
            ...dataRef.current.slice(-3000),
            {
              t,
              pressure: r.pressure ?? null,
              flow: r.flow ?? null,
              grav: g,
              weight: w != null && w > 0 ? w : null,
              temp: r.temp ?? null,
              ...groupTempsFor(groupTempsRef.current),
              stage: s.name ?? null,
              ...activeTargets(s.setpoints),
            },
          ];
          dataDirtyRef.current = true;
        } else if (shotStartRef.current != null) {
          // Shot ended: keep the chart and final time on screen until the next one
          shotStartRef.current = null;
        }
      },
    };
    connectSocket(handlers).catch((e) => { setConnected(false); setError(explainError(e, "Connection")); });
    return () => { disconnectSocket(handlers); };
  // Runs once: everything it calls is a ref or a state setter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heating forecast vs reality, logged on this device (lib/heat-log.ts); live machine only, not the demo
  const heatRunRef = useRef<HeatRun | null>(null);
  /** The machine's mains voltage, read once (GET /machine) */
  const voltageRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (heatStartRef.current == null) return;
    if (voltageRef.current === undefined) {
      voltageRef.current = 0; // asked once
      getMachineInfo().then((i) => { voltageRef.current = i.mainVoltage || 0; }).catch(() => { voltageRef.current = undefined; });
    }
    heatRunRef.current = stepHeatRun(heatRunRef.current, heatSamples, setTemp, heatStartRef.current, {
      voltage: voltageRef.current || undefined,
      profile: statusRef.current?.loaded_profile ?? undefined,
      machineReady: isClickToStart(statusRef.current),
      waitingForWater: isWaitingForWater(statusRef.current),
    });
  }, [heatSamples, setTemp]);

  // Push collected shot points to the chart a few times per second
  useEffect(() => {
    const id = setInterval(() => {
      if (!dataDirtyRef.current) return;
      dataDirtyRef.current = false;
      setData(dataRef.current);
    }, 250);
    return () => clearInterval(id);
  }, []);

  return {
    connected, status, statusRef, preheatLeft, data, setData, grav, heatSamples, setHeatSamples,
    preShot, setTemp, setSetTemp, elapsed, setElapsed, autoFiredRef, pistonPos, setPistonPos,
  };
}
