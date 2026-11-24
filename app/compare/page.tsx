"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare, Loader2, X } from "lucide-react";
import { getHistory, computeShotStats, downsampleFrames } from "@/lib/machine-api";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import type { ShotEntry } from "@/lib/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

const PALETTE = ["#ffc400", "#60a5fa", "#a78bfa", "#34d399"] as const;
const MAX_SHOTS = 4;
const MAX_HISTORY = 20;

export default function ComparePage() {
  useRequireConnection();
  const [allShots, setAllShots] = useState<ShotEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPressure, setShowPressure] = useState(true);
  const [showFlow, setShowFlow] = useState(false);
  const [showWeight, setShowWeight] = useState(false);

  useEffect(() => {
    if (!getSavedIp()) { setLoading(false); return; }
    getHistory()
      .then((shots) => setAllShots(shots.slice(0, MAX_HISTORY)))
      .finally(() => setLoading(false));
  }, []);

  function toggleShot(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < MAX_SHOTS
        ? [...prev, id]
        : prev
    );
  }

  const selectedShots = useMemo(
    () => allShots.filter((s) => selected.includes(s.id)),
    [allShots, selected]
  );

  const chartData = useMemo(() => {
    if (!selectedShots.length) return [];
    const sampled = selectedShots.map((s) => downsampleFrames(s.data, 150));
    const maxFrames = Math.max(...sampled.map((d) => d.length));
    const rows: Record<string, number>[] = [];
    for (let i = 0; i < maxFrames; i++) {
      const row: Record<string, number> = {};
      let t = 0;
      for (let si = 0; si < sampled.length; si++) {
        const frame = sampled[si][i];
        if (frame) {
          const t0 = sampled[si][0]?.time ?? 0;
          t = (frame.time - t0) / 1000; // normalize to seconds from shot start
          row[`p_${si}`] = frame.shot.pressure;
          row[`f_${si}`] = frame.shot.flow;
          row[`w_${si}`] = frame.shot.weight;
        }
      }
      row.t = t;
      rows.push(row);
    }
    return rows;
  }, [selectedShots]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
      <Loader2 className="h-6 w-6 animate-spin text-[#ffc400]" />
    </div>
  );

  const traceToggles = [
    { key: "pressure", label: "Pressure", active: showPressure, onToggle: () => setShowPressure((v) => !v) },
    { key: "flow",     label: "Flow",     active: showFlow,     onToggle: () => setShowFlow((v) => !v) },
    { key: "weight",   label: "Weight",   active: showWeight,   onToggle: () => setShowWeight((v) => !v) },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa] flex items-center gap-2.5">
            <GitCompare className="h-5 w-5 text-[#ffc400]" /> Compare Shots
          </h1>
          <p className="text-sm text-[#fafafa]/40 mt-1">Overlay up to 4 shots to dial in your extraction</p>
        </div>

        {/* Selected badges */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedShots.map((shot, i) => (
              <span
                key={shot.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                style={{ borderColor: `${PALETTE[i]}40`, color: PALETTE[i], backgroundColor: `${PALETTE[i]}10` }}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i] }} />
                {shot.name.slice(0, 20)}
                <button
                  onClick={() => toggleShot(shot.id)}
                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Comparison chart */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#141414] p-5">
          {selectedShots.length < 2 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <GitCompare className="h-8 w-8 text-[#fafafa]/15" />
              <p className="text-sm text-[#fafafa]/40">Select 2 or more shots to compare</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-[#fafafa]">Extraction Curves</p>
                {/* Trace toggles */}
                <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
                  {traceToggles.map(({ key, label, active, onToggle }) => (
                    <button
                      key={key}
                      onClick={onToggle}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                        active
                          ? "bg-[#ffc400]/15 text-[#ffc400]"
                          : "text-[#fafafa]/40 hover:text-[#fafafa]/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => `${Number(v).toFixed(0)}s`}
                    tick={{ fontSize: 11, fill: "rgba(250,250,250,0.3)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgba(250,250,250,0.3)" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    labelFormatter={(l) => `${Number(l).toFixed(1)}s`}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [
                      typeof v === "number" ? v.toFixed(2) : String(v),
                    ]}
                    contentStyle={{
                      backgroundColor: "#141414",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "rgba(250,250,250,0.6)" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(250,250,250,0.4)" }} />
                  {selectedShots.flatMap((shot, i) => {
                    const legend = `${format(new Date(shot.time * 1000), "MMM d")} · ${shot.name.slice(0, 16)}`;
                    const lines = [];
                    if (showPressure)
                      lines.push(
                        <Line
                          key={`p_${shot.id}`}
                          type="monotone"
                          dataKey={`p_${i}`}
                          name={`${legend} (P)`}
                          stroke={PALETTE[i]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    if (showFlow)
                      lines.push(
                        <Line
                          key={`f_${shot.id}`}
                          type="monotone"
                          dataKey={`f_${i}`}
                          name={`${legend} (F)`}
                          stroke={PALETTE[i]}
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          dot={false}
                          connectNulls
                        />
                      );
                    if (showWeight)
                      lines.push(
                        <Line
                          key={`w_${shot.id}`}
                          type="monotone"
                          dataKey={`w_${i}`}
                          name={`${legend} (W)`}
                          stroke={PALETTE[i]}
                          strokeWidth={2}
                          strokeDasharray="2 2"
                          dot={false}
                          connectNulls
                        />
                      );
                    return lines;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Stats comparison table */}
        {selectedShots.length >= 2 && (
          <div className="rounded-2xl border border-white/[0.06] bg-[#141414] p-5">
            <p className="text-sm font-semibold text-[#fafafa] mb-4">Stats Comparison</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#fafafa]/30 text-xs">
                    <th className="text-left py-2 pr-4 font-medium">Shot</th>
                    <th className="text-right py-2 px-3 font-medium">Duration</th>
                    <th className="text-right py-2 px-3 font-medium">Peak Pressure</th>
                    <th className="text-right py-2 px-3 font-medium">Avg Flow</th>
                    <th className="text-right py-2 px-3 font-medium">Final Weight</th>
                    <th className="text-right py-2 pl-3 font-medium">Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedShots.map((shot, i) => {
                    const stats = computeShotStats(shot.data);
                    const flowValues = shot.data
                      .map((f) => f.shot.flow)
                      .filter((v) => !isNaN(v) && v > 0);
                    const avgFlow = flowValues.length
                      ? flowValues.reduce((a, b) => a + b, 0) / flowValues.length
                      : 0;
                    return (
                      <tr key={shot.id} className="border-b border-white/[0.05] last:border-0">
                        <td className="py-2.5 pr-4 text-[#fafafa]/70">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: PALETTE[i] }}
                            />
                            {format(new Date(shot.time * 1000), "MMM d, HH:mm")}
                          </span>
                        </td>
                        <td className="text-right px-3 font-mono text-[#fafafa]/60">{stats.durationSec}s</td>
                        <td className="text-right px-3 font-mono text-[#fafafa]/60">
                          {stats.maxPressure.toFixed(1)} bar
                        </td>
                        <td className="text-right px-3 font-mono text-[#fafafa]/60">
                          {avgFlow.toFixed(2)} ml/s
                        </td>
                        <td className="text-right px-3 font-mono text-[#fafafa]/60">
                          {stats.finalWeight.toFixed(1)}g
                        </td>
                        <td className="text-right pl-3 text-[#fafafa]/60 max-w-[140px] truncate">
                          {shot.name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shot selector */}
        {allShots.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <GitCompare className="h-8 w-8 text-[#fafafa]/15" />
            <p className="text-sm text-[#fafafa]/40">Connect your machine to load shot history</p>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-[#fafafa]/50 mb-3">
              Select shots
              {selected.length > 0 && (
                <span className="ml-2 text-[#fafafa]/25 font-mono">
                  {selected.length}/{MAX_SHOTS}
                </span>
              )}
            </h2>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {allShots.map((shot) => {
                const isSelected = selected.includes(shot.id);
                const colorIdx = selected.indexOf(shot.id);
                const stats = computeShotStats(shot.data);
                return (
                  <button
                    key={shot.id}
                    onClick={() => toggleShot(shot.id)}
                    disabled={!isSelected && selected.length >= MAX_SHOTS}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm flex items-center gap-3 transition-all disabled:opacity-30 ${
                      isSelected
                        ? "text-[#fafafa]"
                        : "border-white/[0.05] bg-[#141414] text-[#fafafa]/60 hover:border-white/[0.10] hover:bg-[#1c1c1c]"
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: `${PALETTE[colorIdx]}30`,
                            backgroundColor: `${PALETTE[colorIdx]}08`,
                          }
                        : {}
                    }
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border-2 transition-all"
                      style={
                        isSelected
                          ? { backgroundColor: PALETTE[colorIdx], borderColor: PALETTE[colorIdx] }
                          : { borderColor: "rgba(250,250,250,0.15)", backgroundColor: "transparent" }
                      }
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{shot.name}</span>
                      <span className="block text-xs text-[#fafafa]/35 mt-0.5">
                        {format(new Date(shot.time * 1000), "MMM d, yyyy · HH:mm")}
                      </span>
                    </span>
                    <span className="text-xs font-mono text-[#fafafa]/25 shrink-0">
                      {stats.durationSec}s · {stats.finalWeight.toFixed(0)}g
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
