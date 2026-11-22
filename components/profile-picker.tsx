"use client";

/**
 * Profile picker with cover art, like the machine's own UI. Covers load
 * straight from the machine, the same way the Profiles page does.
 */

import { useEffect, useState } from "react";
import { ChevronRight, X, Check, Info } from "lucide-react";
import { ProgramPanel } from "@/components/profile-program-view";
import { getProfileImageUrl } from "@/lib/machine-api";
import type { Profile } from "@/lib/types";

export function ProfileCover({ profile, className = "" }: { profile: Profile; className?: string }) {
  const path = profile.display?.image;
  const src = path ? getProfileImageUrl(path) : "";
  const color = profile.display?.accentColor ?? "#ffc400";
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${color}, #141414)` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- image served by the machine
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      )}
    </div>
  );
}

/**
 * Columns × rows so every card fits on screen with roughly square covers:
 * wide screens get more columns, tall screens more rows.
 */
function useGridShape(count: number, active: boolean) {
  const [shape, setShape] = useState({ cols: 4, rows: 3 });
  useEffect(() => {
    if (!active) return;
    const update = () => {
      const n = Math.max(1, count);
      const aspect = window.innerWidth / Math.max(1, window.innerHeight - 70);
      // Card ≈ 1 wide × 1.25 tall (cover plus two text lines)
      let cols = Math.max(1, Math.round(Math.sqrt(n * aspect * 1.25)));
      cols = Math.min(cols, n);
      setShape({ cols, rows: Math.ceil(n / cols) });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [count, active]);
  return shape;
}

/** Compact "selected profile" button that opens the cover grid. */
export function ProfilePicker({
  profiles, selected, disabled, onSelect,
}: {
  profiles: Profile[];
  selected: Profile | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  /** Profile whose stage program is shown over the grid */
  const [programFor, setProgramFor] = useState<Profile | null>(null);
  const grid = useGridShape(profiles.length, open);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || profiles.length === 0}
        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-2 text-left active:scale-[0.99] disabled:opacity-60"
      >
        {selected
          ? <ProfileCover profile={selected} className="h-14 w-14 shrink-0 rounded-lg" />
          : <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.06]" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-[#fafafa]/40">Profile</p>
          <p className="truncate text-lg font-semibold text-[#fafafa]">
            {selected?.name ?? (profiles.length ? "Choose a profile" : "Loading profiles…")}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#fafafa]/40" />
      </button>

      {open && (
        <div
          className="fixed inset-x-0 top-0 z-[120] flex flex-col overflow-hidden bg-[#0a0a0a] p-3"
          style={{ height: "100dvh" }}
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <p className="text-xl font-bold text-[#fafafa]">Choose a profile</p>
            <button onClick={() => setOpen(false)} aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-[#fafafa]/70 active:scale-95">
              <X className="h-6 w-6" />
            </button>
          </div>
          {/* Every profile on one screen: rows share the height, covers shrink to fit */}
          <div
            className="grid min-h-0 flex-1 gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
            }}
          >
            {profiles.map((p) => {
              const isSel = p.id === selected?.id;
              const color = p.display?.accentColor ?? "#ffc400";
              return (
                <div key={p.id} className="relative min-h-0 min-w-0">
                <button
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                  className="relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-1.5 text-left transition-transform active:scale-[0.97]"
                  style={{ backgroundColor: color, outline: isSel ? "3px solid #fafafa" : "none", outlineOffset: 2 }}
                >
                  <ProfileCover profile={p} className="min-h-0 w-full flex-1 rounded-xl [&>img]:h-full" />
                  <p className="mt-1.5 truncate px-1 text-sm font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {p.name}
                  </p>
                  <p className="px-1 pb-0.5 text-xs text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {p.temperature}°C · {p.final_weight}g
                  </p>
                  {isSel && (
                    <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#fafafa] text-[#0a0a0a]">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
                {/* Stage program of this profile */}
                <button onClick={() => setProgramFor(p)} aria-label={`Program of ${p.name}`}
                  className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm active:scale-95">
                  <Info className="h-5 w-5" />
                </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {open && programFor && (
        <ProgramPanel
          profile={programFor}
          onClose={() => setProgramFor(null)}
          onUse={() => { onSelect(programFor.id); setProgramFor(null); setOpen(false); }}
        />
      )}
    </>
  );
}
