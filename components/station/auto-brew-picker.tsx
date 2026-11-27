"use client";

/** Auto brew: off, when the water is ready (the machine's ready), or when the Bar down is ready too */

import type { AutoBrew } from "@/lib/station/auto-brew";

const OPTIONS: { value: AutoBrew; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "water", label: "Water ready" },
  { value: "bardown", label: "Bar down ready" },
];

export function AutoBrewPicker({ value, onChange }: { value: AutoBrew; onChange: (v: AutoBrew) => void }) {
  return (
    <div className="flex items-center gap-2 px-1 text-sm">
      <span className="shrink-0 text-[var(--ink)]/75">Auto brew</span>
      <div role="radiogroup" aria-label="Auto brew" className="flex min-w-0 flex-1 rounded-md bg-[var(--ink)]/[0.06] p-0.5">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`min-h-10 landscape:min-h-8 flex-1 truncate rounded px-2 text-sm font-semibold ${
              value === o.value ? "bg-[var(--primary)] text-[var(--on-primary)]" : "text-[var(--ink)]/65"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
