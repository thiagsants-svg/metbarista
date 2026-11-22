"use client";

/**
 * Profile picker with cover art, like the machine's own UI. Covers load
 * straight from the machine, the same way the Profiles page does.
 */

import { useState } from "react";
import { ChevronRight, X, Check } from "lucide-react";
import { getProfileImageUrl } from "@/lib/machine-api";
import type { Profile } from "@/lib/types";

export function ProfileCover({ profile, className = "" }: { profile: Profile; className?: string }) {
  const path = profile.display?.image;
  const src = path ? getProfileImageUrl(path) : "";
  const color = profile.display?.accentColor ?? "#e8944a";
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${color}, #161210)` }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- image served by the machine
        <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
      )}
    </div>
  );
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled || profiles.length === 0}
        className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0c0a09] p-2 text-left active:scale-[0.99] disabled:opacity-60"
      >
        {selected
          ? <ProfileCover profile={selected} className="h-14 w-14 shrink-0 rounded-lg" />
          : <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.06]" />}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-[#f5f0ea]/40">Profile</p>
          <p className="truncate text-lg font-semibold text-[#f5f0ea]">
            {selected?.name ?? (profiles.length ? "Choose a profile" : "Loading profiles…")}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#f5f0ea]/40" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-[#0c0a09]/95 p-4 backdrop-blur-sm">
          <div className="mb-4 flex shrink-0 items-center justify-between">
            <p className="text-2xl font-bold text-[#f5f0ea]">Choose a profile</p>
            <button onClick={() => setOpen(false)} aria-label="Close"
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] text-[#f5f0ea]/70 active:scale-95">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-3 gap-4 overflow-y-auto landscape:grid-cols-5">
            {profiles.map((p) => {
              const isSel = p.id === selected?.id;
              const color = p.display?.accentColor ?? "#e8944a";
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                  className="relative flex flex-col overflow-hidden rounded-2xl p-2 text-left transition-transform active:scale-[0.97]"
                  style={{ backgroundColor: color, outline: isSel ? "3px solid #f5f0ea" : "none", outlineOffset: 2 }}
                >
                  <ProfileCover profile={p} className="aspect-square w-full rounded-xl" />
                  <p className="mt-2 line-clamp-2 min-h-[2.5em] px-1 text-sm font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {p.name}
                  </p>
                  <p className="px-1 pb-0.5 text-xs text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {p.temperature}°C · {p.final_weight}g
                  </p>
                  {isSel && (
                    <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f0ea] text-[#0c0a09]">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
