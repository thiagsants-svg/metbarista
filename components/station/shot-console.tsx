"use client";

/**
 * Debug-style console under the shot chart: a timestamped log of the stages
 * (start, what each controls, its exits; which exit ended it and the value
 * read), and, while the shot runs, the live stage with how far each exit is
 * and a Skip stage button (the dial's "Skip this step", which sends the
 * machine's continue; two taps, so a stray one does not skip).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, SkipForward } from "lucide-react";
import type { LiveStage, LogEvent, LogKind } from "@/lib/stage-log";

function clock(s: number): string {
  const v = Math.max(0, s);
  const m = Math.floor(v / 60);
  return `${String(m).padStart(2, "0")}:${(v - m * 60).toFixed(1).padStart(4, "0")}`;
}

const TAG: Record<LogKind, { label: string; color: string }> = {
  start: { label: "START", color: "var(--ink)" },
  stage: { label: "STAGE", color: "var(--accent)" },
  exit: { label: "EXIT ", color: "var(--good)" },
  skip: { label: "SKIP ", color: "var(--warn)" },
  cut: { label: "CUT  ", color: "var(--warn)" },
  end: { label: "END  ", color: "var(--weight)" },
};

const r1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export function ShotConsole({ events, live, onSkip, skipBusy, canSkip }: {
  events: LogEvent[];
  live: LiveStage | null;
  onSkip: () => void;
  skipBusy: boolean;
  canSkip: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [arm, setArm] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [events.length]);
  // The confirming tap waits 3 s, then the button goes back
  useEffect(() => {
    if (!arm) return;
    const id = setTimeout(() => setArm(false), 3000);
    return () => clearTimeout(id);
  }, [arm]);
  if (!events.length) return null;

  return (
    <div className="shrink-0 overflow-hidden rounded-md border border-[var(--ink)]/25 bg-[var(--ink)]/[0.05] font-mono text-[13px] leading-snug text-[var(--ink)]">
      <div ref={boxRef} role="log" aria-label="Stage log" className="max-h-[6.2rem] overflow-y-auto px-3 py-1.5">
        {events.map((e, i) => (
          <div key={i}>
            <p className="truncate">
              <span className="tabular-nums text-[var(--ink)]/50">{clock(e.t)}</span>
              <span className="ml-2 whitespace-pre font-bold" style={{ color: TAG[e.kind].color }}>{TAG[e.kind].label}</span>
              <span className="ml-2">{e.text}</span>
            </p>
            {e.detail && <p className="truncate pl-[8.4em] text-[var(--ink)]/55">{e.detail}</p>}
          </div>
        ))}
      </div>
      {live && (
        <div className="flex items-center gap-3 border-t border-[var(--ink)]/15 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate">
              <span className="font-bold text-[var(--accent)]">▶ {live.name}</span>
              <span className="ml-2 tabular-nums text-[var(--ink)]/60">{r1(live.elapsed)} s in stage</span>
              {live.next && <span className="ml-2 text-[var(--ink)]/45">next: {live.next}</span>}
            </p>
            {live.exits.length === 0 ? (
              <p className="text-[var(--ink)]/55">no exit: runs to the target weight</p>
            ) : (
              <div className="flex flex-wrap gap-x-4">
                {live.exits.map((x) => (
                  <span key={x.label} className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="text-[var(--ink)]/70">{x.label}</span>
                    <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-[var(--ink)]/15">
                      <span className="block h-full rounded-full bg-[var(--good)]" style={{ width: `${Math.round(x.share * 100)}%` }} />
                    </span>
                    <span>{r1(x.now)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {canSkip && live.next && (
            <button type="button" disabled={skipBusy}
              onClick={() => { if (arm) { setArm(false); onSkip(); } else setArm(true); }}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 font-sans text-sm font-bold active:scale-[0.97] disabled:opacity-50 ${
                arm ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--ink)]/30 text-[var(--ink)]"}`}>
              {skipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
              {arm ? "Tap to skip" : "Skip stage"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
