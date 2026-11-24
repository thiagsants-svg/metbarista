"use client";

/**
 * Piston health, on the Stats page: the seal's friction shot after shot (motor
 * current of the lift after each shot, see lib/piston.ts), by week since the
 * first shot on the machine, with the maintenance you logged on the chart.
 * Read only: nothing is sent to the machine.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wrench, X } from "lucide-react";
import { beforeAfter, summarise, weekly, type LiftReading } from "@/lib/piston";
import {
  addMaintenance, cachedReadings, daySec, deleteMaintenance, listMaintenance, updateReadings,
  MAINTENANCE_LABEL, type Maintenance, type MaintenanceKind,
} from "@/lib/piston-store";

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDayYear = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const pct = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}%`;

const W = 640, H = 190, PAD = { l: 40, r: 10, t: 14, b: 22 };

export function PistonCard() {
  const [readings, setReadings] = useState<LiftReading[]>(() => (typeof window === "undefined" ? [] : cachedReadings()));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<Maintenance[]>(() => (typeof window === "undefined" ? [] : listMaintenance()));
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(today);
  const [kind, setKind] = useState<MaintenanceKind>("grease");

  // Measure the shots not measured yet (all of them the first time)
  useEffect(() => {
    let alive = true;
    updateReadings((done, total, r) => {
      if (!alive) return;
      setProgress(done < total ? { done, total } : null);
      setReadings(r);
    }, () => alive).catch((e) => { if (alive) { setError(e instanceof Error ? e.message : String(e)); setProgress(null); } });
    return () => { alive = false; };
  }, []);

  const weeks = useMemo(() => weekly(readings), [readings]);
  const sum = useMemo(() => summarise(readings), [readings]);
  const last = log.at(-1);
  const since = useMemo(() => (last ? beforeAfter(readings, daySec(last.day)) : null), [readings, last]);

  const section = "mt-6 text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70";
  const tile = (label: string, value: string, sub?: string) => (
    <div className="min-w-0 border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-xs tabular-nums text-[var(--ink)]/65">{sub}</p>}
    </div>
  );

  // Chart scale
  const x0 = weeks[0]?.start ?? 0;
  const x1 = Math.max(x0 + 1, weeks.at(-1)?.start ?? 1);
  const lo = Math.min(...weeks.map((w) => w.amps));
  const hi = Math.max(...weeks.map((w) => w.amps));
  const y0 = Math.floor((lo - 0.1) * 10) / 10;
  const y1 = Math.ceil((hi + 0.1) * 10) / 10;
  const sx = (ms: number) => PAD.l + ((ms - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (a: number) => PAD.t + (1 - (a - y0) / Math.max(0.01, y1 - y0)) * (H - PAD.t - PAD.b);
  const ticks = [y0, (y0 + y1) / 2, y1];

  return (
    <section aria-labelledby="piston-title">
      <p id="piston-title" className={section}>Piston health</p>
      <p className="mt-1 text-sm text-[var(--ink)]/75">
        How hard the motor works to lift the piston after each shot. It rises as the seal dries or scale builds up, and drops
        after greasing or descaling. Read from the shots the machine keeps; nothing is sent to it.
      </p>

      {progress && (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-sm tabular-nums text-[var(--ink)]/80">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
            Reading the machine&apos;s shots: {progress.done} of {progress.total}
          </p>
          <div className="mt-1 h-1.5 rounded-full bg-[var(--ink)]/10">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--ink)]/60">Only the first time; after that only new shots are read.</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-[var(--ink)]/75">Couldn&apos;t read all the shots: {error}</p>}

      {sum ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-4 sm:max-w-xl">
            {tile("Now", `${sum.now.toFixed(2)} A`, "last 20 shots")}
            {tile("At the start", `${sum.first.toFixed(2)} A`, weeks[0] ? `from ${fmtDayYear(weeks[0].start)}` : undefined)}
            {tile("Change", pct(sum.change), `${sum.n} shots measured`)}
          </div>

          {weeks.length >= 2 && (
            <figure className="mt-4">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
                aria-label={`Weekly motor current from ${sum.first.toFixed(2)} to ${sum.now.toFixed(2)} amps`}>
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--ink)" strokeOpacity={0.12} />
                    <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink)" fillOpacity={0.6}>{t.toFixed(1)}</text>
                  </g>
                ))}
                {log.map((m) => {
                  const ms = daySec(m.day) * 1000;
                  if (ms < x0 || ms > x1 + 7 * 86_400_000) return null;
                  const x = sx(Math.min(ms, x1));
                  return (
                    <g key={m.id}>
                      <line x1={x} x2={x} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1.5} />
                      <text x={x + 4} y={PAD.t + 8} fontSize={11} fill="var(--accent)">{m.kind === "grease" ? "grease" : m.kind === "descale" ? "descale" : "service"}</text>
                    </g>
                  );
                })}
                <polyline fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round"
                  points={weeks.map((w) => `${sx(w.start)},${sy(w.amps)}`).join(" ")} />
                {weeks.map((w) => (
                  <circle key={w.start} cx={sx(w.start)} cy={sy(w.amps)} r={3} fill="var(--primary)">
                    <title>{`Week of ${fmtDay(w.start)}: ${w.amps.toFixed(2)} A (${w.shots} shot${w.shots === 1 ? "" : "s"})`}</title>
                  </circle>
                ))}
                <text x={PAD.l} y={H - 5} fontSize={11} fill="var(--ink)" fillOpacity={0.6}>{fmtDay(x0)}</text>
                <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize={11} fill="var(--ink)" fillOpacity={0.6}>{fmtDay(x1)}</text>
              </svg>
              <figcaption className="text-xs text-[var(--ink)]/60">Motor current (A), median of each week. Lower is smoother.</figcaption>
            </figure>
          )}

          {last && (
            <p className="mt-3 text-base">
              {since
                ? <>Since you {last.kind === "grease" ? "greased it" : last.kind === "descale" ? "descaled" : "serviced it"} on {fmtDay(daySec(last.day) * 1000)}:{" "}
                  <b className="tabular-nums">{since.before.toFixed(2)} → {since.after.toFixed(2)} A</b>{" "}
                  <span className="tabular-nums text-[var(--ink)]/75">({pct(((since.after - since.before) / since.before) * 100)}, {since.n} shots after)</span></>
                : <>Logged {MAINTENANCE_LABEL[last.kind].toLowerCase()} on {fmtDay(daySec(last.day) * 1000)}: the change shows after a few shots.</>}
            </p>
          )}
        </>
      ) : !progress && !error && (
        <p className="mt-2 text-sm text-[var(--ink)]/70">Not enough shots measured yet.</p>
      )}

      {/* Maintenance log */}
      <div className="mt-4">
        {log.length > 0 && (
          <ul className="mb-2 space-y-1">
            {[...log].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-[var(--ink)]/60" />
                <span className="tabular-nums text-[var(--ink)]/75">{fmtDayYear(daySec(m.day) * 1000)}</span>
                <span className="font-semibold">{MAINTENANCE_LABEL[m.kind]}</span>
                <button type="button" onClick={() => setLog(deleteMaintenance(m.id))} aria-label={`Remove ${MAINTENANCE_LABEL[m.kind]} on ${m.day}`}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)]/60 active:bg-[var(--ink)]/10">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--ink)]/20 p-2">
            <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} aria-label="Day"
              className="h-10 rounded-md border border-[var(--ink)]/25 bg-transparent px-2 text-sm" />
            {(Object.keys(MAINTENANCE_LABEL) as MaintenanceKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`h-10 rounded-full border px-3 text-sm font-semibold ${kind === k ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25"}`}>
                {MAINTENANCE_LABEL[k]}
              </button>
            ))}
            <button type="button" disabled={!day} onClick={() => { setLog(addMaintenance(day, kind)); setAdding(false); }}
              className="h-10 rounded-full bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setAdding(false)} className="h-10 px-3 text-sm text-[var(--ink)]/70">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setDay(today()); setAdding(true); }}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--ink)]/25 px-4 text-sm font-semibold active:scale-[0.97]">
            <Wrench className="h-4 w-4" /> Log maintenance
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-[var(--ink)]/60">
        Method from{" "}
        <a href="https://github.com/hessius/ha-meticulous" target="_blank" rel="noreferrer" className="underline underline-offset-2">ha-meticulous</a>
        {" "}by hessius (MIT). Machines differ: compare yours with itself over time, not with a fixed number.
      </p>
    </section>
  );
}
