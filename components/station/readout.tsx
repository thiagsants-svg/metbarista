"use client";

/** Big number tiles and the small machine buttons of the Station */

import { Loader2 } from "lucide-react";

export function Readout({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="min-w-0 overflow-hidden border-t-2 border-[var(--ink)] pt-1.5">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="text-[clamp(1.5rem,3.3vmax,2.6rem)] font-extrabold tracking-tight tabular-nums leading-tight whitespace-nowrap" style={{ color }}>
        {value}
        {unit && value !== "—" && <span className="ml-1 text-xs font-medium text-[var(--ink)]/65">{unit}</span>}
      </p>
    </div>
  );
}

export function SmallButton({
  icon: Icon, label, onClick, disabled, busy, active,
}: {
  icon: React.ElementType; label: string; onClick: () => void; disabled: boolean; busy: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={active ? "Preheating. Tap to stop." : undefined}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-sm font-semibold transition-all active:scale-95 disabled:opacity-30 ${
        active
          ? "border-[var(--ink)]/30 bg-[var(--ink)]/[0.06] text-[var(--accent)]"
          : "border-[var(--ink)]/20 bg-transparent text-[var(--ink)]/80"
      }`}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className={`h-5 w-5 ${active ? "animate-pulse" : ""}`} />}
      {label}
    </button>
  );
}
