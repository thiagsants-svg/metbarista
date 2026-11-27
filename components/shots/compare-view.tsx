"use client";

/**
 * Two shots side by side: both curves on one chart (this shot solid, the
 * other dashed) and what changed between them, recipe and result. Idea from
 * Metic (hessius/MeticAI).
 */

import { memo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import { COLORS } from "@/components/shot-charts";
import { fmtClock, grindText, type ShotRowData } from "@/components/shots/shot-row";
import { shotPoints, type ShotCurvePoint } from "@/lib/coffee-history";
import { PREP_STAGE, stageSummary } from "@/lib/stage-summary";
import { formatRatio } from "@/lib/recipe";
import type { ShotEntry } from "@/lib/types";

export interface ShotPick { row: ShotRowData; shot: ShotEntry }

const AXIS_TICK = { fontSize: 13, fill: "var(--ink)", fillOpacity: 0.7 };
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

/** ms from the start to the first drops (2 g in the cup), or 0 */
const dropsAt = (pts: ShotCurvePoint[]) => {
  const hit = pts.find((p) => (p.weight ?? 0) >= 2);
  return hit ? hit.t - (pts[0]?.t ?? 0) : 0;
};

const CompareChart = memo(function CompareChart({ a, b, align }: { a: ShotCurvePoint[]; b: ShotCurvePoint[]; align: "start" | "drops" }) {
  // From their own start, or lined up at the first drops (pre-infusions of different lengths overlay)
  const zero = (pts: ShotCurvePoint[]) => {
    const off = (pts[0]?.t ?? 0) + (align === "drops" ? dropsAt(pts) : 0);
    return pts.map((p) => ({ ...p, t: p.t - off }));
  };
  const A = zero(a), B = zero(b);
  const tMin = Math.min(0, A[0]?.t ?? 0, B[0]?.t ?? 0);
  // Flow scale fitted to the extraction (90th percentile): the fill's spike may run off the top
  const fl = [...A, ...B].filter((p) => (p.pressure ?? 0) > 1).map((p) => p.flow ?? 0).filter((v) => v > 0).sort((x, y) => x - y);
  const flowTop = Math.min(8, Math.max(3, Math.ceil((fl.length ? fl[Math.floor(fl.length * 0.9)] : 2) * 1.4)));
  const maxW = Math.max(10, ...A.map((p) => p.weight ?? 0), ...B.map((p) => p.weight ?? 0));
  const weightTop = Math.ceil((maxW * 1.15) / 10) * 10;
  const tMax = Math.max(A.at(-1)?.t ?? 1, B.at(-1)?.t ?? 1);
  const line = (data: ShotCurvePoint[], key: "pressure" | "flow" | "weight", color: string, dashed: boolean) => (
    <Line data={data} yAxisId={key === "weight" ? "w" : key === "flow" ? "f" : "l"} type="linear" dataKey={key} stroke={color}
      strokeWidth={dashed ? 2 : 2.5} strokeDasharray={dashed ? "6 4" : undefined} strokeOpacity={dashed ? 0.75 : 1}
      dot={false} isAnimationActive={false} connectNulls />
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--ink) 12%, transparent)" strokeDasharray="2 4" />
        <XAxis dataKey="t" type="number" domain={[tMin, tMax]} allowDuplicatedCategory={false}
          tickFormatter={(v) => `${Math.round(v / 1000)}s`} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis yAxisId="l" domain={[0, 12]} ticks={[0, 2, 4, 6, 8, 10, 12]} width={28} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis yAxisId="f" domain={[0, flowTop]} ticks={Array.from({ length: flowTop + 1 }, (_, i) => i)} allowDataOverflow width={22}
          tick={{ ...AXIS_TICK, fontSize: 11, fill: COLORS.flow, fillOpacity: 0.55 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="w" orientation="right" domain={[0, weightTop]} width={36}
          tick={{ ...AXIS_TICK, fill: COLORS.weight }} tickLine={false} axisLine={false} unit="g" />
        {line(B, "weight", COLORS.weight, true)}
        {line(B, "pressure", COLORS.pressure, true)}
        {line(B, "flow", COLORS.flow, true)}
        {line(A, "weight", COLORS.weight, false)}
        {line(A, "pressure", COLORS.pressure, false)}
        {line(A, "flow", COLORS.flow, false)}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

interface Facts { cup: number; seconds: number; ratio: number | null; maxP: number; maxF: number; preinf: number | null; grind: string | null; grindN: number | null; temp: number | null; tds: number | null; ey: number | null }

function factsOf({ row, shot }: ShotPick): Facts {
  const s = row.sum;
  const st = stageSummary(shot.data ?? [], shot.profile);
  return {
    cup: s.weight, seconds: s.seconds,
    ratio: s.patch.dose ? s.weight / s.patch.dose : null,
    maxP: Math.max(0, ...st.stages.map((x) => x.maxP)),
    // Flow while extracting: the chamber fill always runs near the pump's maximum
    maxF: Math.max(0, ...st.stages.filter((x) => !PREP_STAGE.test(x.name)).map((x) => x.maxF)),
    preinf: st.preinfusion?.seconds ?? null,
    grind: grindText(s), grindN: s.patch.grindUm ?? s.patch.grindSetting ?? null,
    temp: s.patch.temperature ?? null, tds: s.tds ?? null, ey: s.ey ?? null,
  };
}

/** "+2.4 g" or "" when nothing changed or either side is missing */
function delta(a: number | null, b: number | null, unit: string, digits = 1): string {
  if (a == null || b == null) return "";
  const d = a - b;
  if (Math.abs(d) < 0.5 * 10 ** -digits) return "same";
  return `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}${unit}`;
}

export function CompareView({ a, b, onClose }: { a: ShotPick; b: ShotPick; onClose: () => void }) {
  const [align, setAlign] = useState<"start" | "drops">("start");
  const A = factsOf(a), B = factsOf(b);
  const rows: [string, string, string, string][] = [
    ["Grind", A.grind ?? "—", B.grind ?? "—", delta(A.grindN, B.grindN, a.row.sum.patch.grindUm != null ? " µm" : "", 0)],
    ["Temp", A.temp != null ? `${A.temp} °C` : "—", B.temp != null ? `${B.temp} °C` : "—", delta(A.temp, B.temp, " °C", 0)],
    ["In the cup", `${A.cup.toFixed(1)} g`, `${B.cup.toFixed(1)} g`, delta(A.cup, B.cup, " g")],
    ["Ratio", A.ratio ? formatRatio(A.ratio) : "—", B.ratio ? formatRatio(B.ratio) : "—", delta(A.ratio, B.ratio, "", 2)],
    ["Time", fmtClock(A.seconds), fmtClock(B.seconds), delta(A.seconds, B.seconds, " s", 0)],
    ["Pre-infusion", A.preinf != null ? `${A.preinf.toFixed(1)} s` : "—", B.preinf != null ? `${B.preinf.toFixed(1)} s` : "—", delta(A.preinf, B.preinf, " s")],
    ["Max pressure", `${A.maxP.toFixed(1)} bar`, `${B.maxP.toFixed(1)} bar`, delta(A.maxP, B.maxP, " bar")],
    ["Max flow, extraction", `${A.maxF.toFixed(1)} ml/s`, `${B.maxF.toFixed(1)} ml/s`, delta(A.maxF, B.maxF, " ml/s")],
    ["TDS", A.tds != null ? `${A.tds.toFixed(2)}%` : "—", B.tds != null ? `${B.tds.toFixed(2)}%` : "—", delta(A.tds, B.tds, "", 2)],
    ["EY", A.ey != null ? `${A.ey.toFixed(1)}%` : "—", B.ey != null ? `${B.ey.toFixed(1)}%` : "—", delta(A.ey, B.ey, "")],
  ];

  return (
    <section className="space-y-2" aria-label="Comparison">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--ink)]/80">
          <span className="font-semibold text-[var(--ink)]">Solid: this shot</span>
          {" · "}
          <span className="font-semibold text-[var(--ink)]">dashed:</span> {when(b.row.sum.when)}
          {b.row.sum.coffee ? ` · ${b.row.sum.coffee}` : ""}
        </p>
        <button type="button" onClick={onClose} aria-label="Stop comparing"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative h-64">
        <CompareChart a={shotPoints(a.shot)} b={shotPoints(b.shot)} align={align} />
      </div>
      <div className="flex items-center gap-2 text-sm" role="group" aria-label="Line the shots up">
        <span className="text-[var(--ink)]/70">Line up at</span>
        {(["start", "drops"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={align === k} onClick={() => setAlign(k)}
            className={`h-9 rounded-full border px-3 font-semibold active:scale-[0.97] ${align === k ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25"}`}>
            {k === "start" ? "the start" : "the first drops"}
          </button>
        ))}
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[var(--ink)]/60">
            <th className="py-1 font-semibold" />
            <th className="py-1 font-semibold">This shot</th>
            <th className="py-1 font-semibold">{when(b.row.sum.when)}</th>
            <th className="py-1 text-right font-semibold">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ink)]/10">
          {rows.map(([label, va, vb, d]) => (
            <tr key={label}>
              <td className="py-1.5 pr-2 text-[var(--ink)]/70">{label}</td>
              <td className="py-1.5 pr-2 font-semibold">{va}</td>
              <td className="py-1.5 pr-2 text-[var(--ink)]/80">{vb}</td>
              <td className={`py-1.5 text-right font-semibold ${d && d !== "same" ? "text-[var(--accent)]" : "text-[var(--ink)]/50"}`}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The shots to compare with: the same coffee first, then the rest, newest first */
export function ComparePicker({ current, others, onPick, onClose }: {
  current: ShotRowData;
  others: ShotPick[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const same = (p: ShotPick) => !!current.sum.coffee && p.row.sum.coffee?.toLowerCase() === current.sum.coffee.toLowerCase();
  const list = [...others.filter(same), ...others.filter((p) => !same(p))].filter((p) => !p.row.flush);
  return (
    <div className="rounded-md border border-[var(--ink)]/20">
      <div className="flex items-center justify-between border-b border-[var(--ink)]/15 px-3 py-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Compare with</p>
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink)]/70 active:bg-[var(--ink)]/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="max-h-72 divide-y divide-[var(--ink)]/10 overflow-y-auto">
        {list.map((p) => (
          <li key={p.row.id}>
            <button type="button" onClick={() => onPick(p.row.id)} className="w-full px-3 py-2 text-left active:bg-[var(--ink)]/[0.06]">
              <p className="text-sm tabular-nums">
                <span className="text-[var(--ink)]/70">{when(p.row.sum.when)}</span>
                <b className="ml-2">{p.row.sum.weight.toFixed(1)} g · {fmtClock(p.row.sum.seconds)}</b>
                {grindText(p.row.sum) && <b className="ml-2">{grindText(p.row.sum)}</b>}
              </p>
              <p className="truncate text-xs text-[var(--ink)]/65">
                {p.row.sum.coffee || "No coffee"} · {p.row.sum.profileName}
                {p.row.sum.tds != null ? ` · TDS ${p.row.sum.tds.toFixed(2)}%` : ""}
              </p>
            </button>
          </li>
        ))}
      </ol>
      {list.length === 0 && <p className="px-3 py-3 text-sm text-[var(--ink)]/70">No other shots loaded.</p>}
    </div>
  );
}
