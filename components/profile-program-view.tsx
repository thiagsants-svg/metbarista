"use client";

/**
 * Profile "program" views: the running stage during a shot, and the full
 * list of stages for a profile (from the profile picker).
 */

import { ArrowRight, X } from "lucide-react";
import { ProfileCurvePreview } from "@/components/charts/profile-curve-preview";
import { profileProgram, type StageProgram } from "@/lib/profile-program";
import type { Profile } from "@/lib/types";

/** Compact card under the shot chart: what the running stage does, when it ends, what's next. */
export function StageNow({
  current, next, index, total,
}: {
  current: StageProgram | null;
  next: StageProgram | null;
  index: number;
  total: number;
}) {
  if (!current) return null;
  return (
    <div className="flex shrink-0 items-start gap-3 rounded-md border border-[var(--ink)]/30 bg-[var(--ink)]/[0.06] px-3 py-2">
      <span className="mt-0.5 shrink-0 rounded-md bg-[var(--primary)] px-1.5 py-0.5 font-mono text-xs font-bold text-[var(--on-primary)]">
        {index + 1}/{total}
      </span>
      <p className="min-w-0 flex-1 truncate text-sm leading-snug">
        <span className="font-bold text-[var(--accent)]">{current.name}</span>
        {current.exits.length > 0 && <span className="text-[var(--ink)]/75"> · ends {current.exits.join(" or ")}</span>}
      </p>
      {next && (
        <span className="hidden shrink-0 items-center gap-1 self-center text-xs text-[var(--ink)]/70 sm:inline-flex">
          <ArrowRight className="h-3.5 w-3.5" /> {next.name}
        </span>
      )}
    </div>
  );
}

/** Full program of a profile: planned curve plus every stage, with a button to use it. */
export function ProgramPanel({
  profile, onUse, onClose,
}: {
  profile: Profile;
  onUse: () => void;
  onClose: () => void;
}) {
  const program = profileProgram(profile);
  const color = profile.display?.accentColor ?? "#ffc400";
  return (
    <div className="fixed inset-x-0 top-0 z-[125] flex flex-col overflow-hidden bg-[var(--paper)] p-3" style={{ height: "100dvh" }}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-[var(--ink)]">{profile.name}</p>
          <p className="text-sm text-[var(--ink)]/70">
            {profile.author ? `${profile.author} · ` : ""}{profile.temperature}°C · {profile.final_weight}g · {program.length} stages
          </p>
        </div>
        <button onClick={onClose} aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="shrink-0 rounded-md border border-[var(--ink)]/20 bg-transparent p-3 text-[var(--ink)]/30">
        <ProfileCurvePreview profile={profile} width={560} height={90} accentColor={color} />
      </div>

      <ol className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {program.map((s, i) => (
          <li key={`${s.name}-${i}`} className="flex gap-3 rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2">
            <span className="mt-0.5 h-6 w-6 shrink-0 rounded-md text-center font-mono text-sm font-bold leading-6 text-[var(--paper)]"
              style={{ backgroundColor: color }}>{i + 1}</span>
            <div className="min-w-0 leading-snug">
              <p className="text-base font-semibold text-[var(--ink)]">{s.name}</p>
              <p className="text-sm text-[var(--ink)]/80">{s.control}{s.limits.length ? ` · ${s.limits.join(", ")}` : ""}</p>
              <p className="text-xs text-[var(--ink)]/70">Ends {s.exits.join(" or ")}</p>
            </div>
          </li>
        ))}
      </ol>

      <button onClick={onUse}
        className="mt-2 h-14 shrink-0 rounded-md bg-[var(--primary)] text-lg font-bold text-[var(--on-primary)] active:scale-[0.99]">
        Use this profile
      </button>
    </div>
  );
}
