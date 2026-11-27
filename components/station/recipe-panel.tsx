"use client";

/**
 * The Station's recipe: base profile, dose / ratio / temperature wheels,
 * coffee (with the recent list), grinder and its settings, auto brew.
 */

import { useState } from "react";
import { Bluetooth, ChevronDown, Loader2 } from "lucide-react";
import { AutoBrewPicker } from "@/components/station/auto-brew-picker";
import type { AutoBrew } from "@/lib/station/auto-brew";
import { ProfilePicker } from "@/components/profile-picker";
import { WheelPicker } from "@/components/wheel-picker";
import {
  type GrinderFields, type Recipe, RATIO_PRESETS, beverageWeight, formatRatio, maxYieldFor, overCapacity,
  GRINDER_DEFAULTS, isMotto80, profilePatch, recentGrinders,
} from "@/lib/recipe";
import type { LinkState } from "@/lib/motto80";
import { activeBeans } from "@/lib/coffees";
import type { Profile } from "@/lib/types";

/** Wheel values: dose 5–30 g in 0.5 steps, temperature 70–100 °C in 1 °C steps */
const DOSES = Array.from({ length: 51 }, (_, i) => 5 + i * 0.5);
const TEMPS = Array.from({ length: 31 }, (_, i) => 70 + i);

function nearest(items: number[], v: number): number {
  return items.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), items[0]);
}

function fmtDose(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

export function RecipePanel({
  profiles, base, recipe, editable, onChange, onPickCoffee, onToggleGrinder, grinderLink,
  autoBrew, onAutoBrew,
}: {
  profiles: Profile[]; base: Profile | null; recipe: Recipe; editable: boolean;
  onChange: (patch: Partial<Recipe>) => void;
  onPickCoffee: (name: string) => void;
  onToggleGrinder: () => void;
  grinderLink: LinkState;
  autoBrew: AutoBrew; onAutoBrew: (v: AutoBrew) => void;
}) {
  // Recent beans come from localStorage: loaded when the field gets focus
  const [beans, setBeans] = useState<string[]>([]);
  const [grinders, setGrinders] = useState<GrinderFields[]>([]);
  /** Which wheel is open (dose, ratio or temperature) */
  const [wheel, setWheel] = useState<"dose" | "ratio" | "temperature" | null>(null);
  /** Full list of recent coffees (the keyboard's suggestions only show matches) */
  const [beansOpen, setBeansOpen] = useState(false);
  const motto = isMotto80(recipe.grinder);
  // The temperature the profile was designed for, shown when the recipe runs it at another
  const profileTemp = Number.isFinite(Number(base?.temperature)) ? Math.round(Number(base?.temperature)) : null;
  return (
    <div className="order-1 portrait:col-span-2 space-y-2 border-t-2 border-[var(--ink)] pt-2.5">
      <ProfilePicker
        profiles={profiles}
        selected={base}
        disabled={!editable}
        onSelect={(id) => {
          // A profile is designed for its own temperature and yield: switching takes them (the wheels can change them after)
          const pr = profiles.find((x) => x.id === id);
          onChange(pr ? profilePatch(pr, recipe) : { baseProfileId: id });
        }}
      />
      {/* Dose, ratio and temperature: each tile opens its own wheel; the value applies when the wheel stops */}
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: "dose", label: "Dose", val: fmtDose(recipe.dose), unit: "g", wheelLabel: "Dose (g)", items: DOSES, format: fmtDose },
          { key: "ratio", label: overCapacity(recipe) ? `⚠ max ~${maxYieldFor(recipe.dose)} g` : "Ratio", val: formatRatio(recipe.ratio), unit: `= ${beverageWeight(recipe)} g`, wheelLabel: "Ratio",
            items: RATIO_PRESETS, format: (v: number) => `${formatRatio(v)}${overCapacity({ dose: recipe.dose, ratio: v }) ? " ⚠" : ""}` },
          { key: "temperature", label: profileTemp != null && Math.abs(profileTemp - recipe.temperature) >= 1 ? `Temp · profile ${profileTemp}` : "Temp", val: String(recipe.temperature), unit: "°C", wheelLabel: "Temp (°C)", items: TEMPS, format: String },
        ] as const).map((t) => (
          <div key={t.key} className="relative min-w-0">
            <button type="button" disabled={!editable} onClick={() => setWheel(wheel === t.key ? null : t.key)}
              className={`flex h-16 landscape:h-12 w-full min-w-0 flex-col items-center justify-center rounded-md border active:scale-[0.98] disabled:opacity-60 ${
                wheel === t.key ? "border-[var(--ink)] bg-[var(--ink)]/[0.06]" : "border-[var(--ink)]/20"}`}>
              {/* Over the machine's capacity: the ratio tile says how far the shot can go */}
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                t.key === "ratio" && overCapacity(recipe) ? "text-[var(--stop)]" : "text-[var(--ink)]/70"}`}>{t.label}</span>
              <span className="whitespace-nowrap text-2xl landscape:text-xl font-extrabold tabular-nums leading-tight">
                {t.val}<span className="ml-1 text-xs font-medium text-[var(--ink)]/70">{t.unit}</span>
              </span>
            </button>
            {wheel === t.key && (
              <>
                {/* Tap outside closes */}
                <div className="fixed inset-0 z-40" onClick={() => setWheel(null)} />
                <div className="absolute bottom-full left-0 right-0 z-50 mb-1 landscape:bottom-auto landscape:top-full landscape:mb-0 landscape:mt-1 rounded-md border border-[var(--ink)]/30 bg-[var(--paper)] px-1 py-2 shadow-lg">
                  <WheelPicker label={t.wheelLabel} items={t.items as readonly number[] as number[]}
                    value={nearest(t.items as readonly number[] as number[], recipe[t.key])} format={t.format as (v: number) => string}
                    onChange={(v) => onChange({ [t.key]: v } as Partial<Recipe>)}
                    onDone={() => setWheel(null)} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {/* Beans and grinder: sent with the shot, so they show in shot history */}
      <div className={`grid gap-2 ${motto ? "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"}`}>
        <div className="relative flex min-w-0 gap-1.5">
        <label className="flex h-14 landscape:h-12 min-w-0 flex-col justify-center rounded-md border border-[var(--ink)]/20 px-2.5 flex-1">
        <span className="text-xs font-semibold uppercase leading-none tracking-wider text-[var(--ink)]/70">Coffee</span>
        <input value={recipe.coffee ?? ""} disabled={!editable} placeholder="Type or pick the beans" list="recent-beans"
          // Whole name selected: typing replaces it at once (no backspacing)
          onFocus={(e) => { setBeans(activeBeans()); e.currentTarget.select(); }}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ coffee: v });
            // Picked from the list (or typed in full): bring back that coffee's last shot
            const hit = beans.find((b) => b.toLowerCase() === v.trim().toLowerCase());
            if (hit) onPickCoffee(hit);
          }} aria-label="Coffee"
          className="w-full min-w-0 bg-transparent text-base font-semibold text-[var(--ink)] tabular-nums outline-none placeholder:text-[var(--ink)]/45 disabled:opacity-60 truncate" />
        </label>
        <datalist id="recent-beans">{beans.map((b) => <option key={b} value={b} />)}</datalist>
        {/* All recent coffees, most recently used first */}
        <button type="button" disabled={!editable} aria-label="Recent coffees" title="Recent coffees"
          onClick={() => { setBeans(activeBeans()); setBeansOpen((o) => !o); }}
          className={`flex h-14 w-11 landscape:h-12 shrink-0 items-center justify-center rounded-md border active:scale-95 disabled:opacity-30 ${
            beansOpen ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/20 text-[var(--ink)]/80"}`}>
          <ChevronDown className={`h-5 w-5 transition-transform ${beansOpen ? "rotate-180" : ""}`} />
        </button>
        {beansOpen && (
          <>
            {/* Tap outside closes */}
            <div className="fixed inset-0 z-40" onClick={() => setBeansOpen(false)} />
            <ul className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[50dvh] overflow-y-auto rounded-md border border-[var(--ink)]/30 bg-[var(--paper)] py-1 shadow-lg">
              {beans.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[var(--ink)]/70">No coffees yet: add them on the Coffees page, or type one and brew</li>
              ) : beans.map((b) => (
                <li key={b}>
                  <button type="button"
                    onClick={() => { setBeansOpen(false); onChange({ coffee: b }); onPickCoffee(b); }}
                    className={`block w-full truncate px-3 py-2.5 text-left text-base active:bg-[var(--ink)]/10 ${
                      b.toLowerCase() === (recipe.coffee ?? "").trim().toLowerCase() ? "font-bold text-[var(--accent)]" : "text-[var(--ink)]"}`}>
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        </div>
        <label className="flex h-14 landscape:h-12 min-w-0 flex-col justify-center rounded-md border border-[var(--ink)]/20 px-2.5">
        <span className="text-xs font-semibold uppercase leading-none tracking-wider text-[var(--ink)]/70">Grinder</span>
        <input value={recipe.grinder ?? GRINDER_DEFAULTS.grinder} disabled={!editable} placeholder="Grinder"
          list="recent-grinders" onFocus={() => setGrinders(recentGrinders())}
          onChange={(e) => {
            const v = e.target.value;
            // Picked from the list: bring back that grinder's last settings
            const hit = grinders.find((g) => g.grinder?.toLowerCase() === v.trim().toLowerCase());
            const clear = { grindUm: undefined, grindSetting: undefined, feed: undefined, rpm: undefined };
            // A new grinder of the other kind starts empty (no Motto 80 rpm on a Niche)
            const switching = isMotto80(recipe.grinder) !== isMotto80(v);
            onChange(hit ? { ...clear, ...hit } : switching ? { ...clear, grinder: v } : { grinder: v });
          }} aria-label="Grinder"
          className="w-full min-w-0 bg-transparent text-base font-semibold text-[var(--ink)] tabular-nums outline-none placeholder:text-[var(--ink)]/45 disabled:opacity-60 truncate" />
        </label>
        <datalist id="recent-grinders">{grinders.map((g) => <option key={g.grinder} value={g.grinder} />)}</datalist>
        {/* Bluetooth link to the Motto 80 (read only): on = fields follow the grinder; off frees it for the BOOKOO app */}
        {motto && <button type="button" onClick={onToggleGrinder}
          aria-label={grinderLink === "on" ? "Disconnect grinder" : grinderLink === "lost" ? "Reconnect grinder" : "Connect grinder"}
          title={grinderLink === "on" ? "Disconnect grinder" : grinderLink === "lost" ? "Reconnect grinder" : "Connect grinder"}
          className={`flex h-14 w-11 landscape:h-12 items-center justify-center rounded-md border active:scale-95 disabled:opacity-30 ${
            grinderLink === "on"
              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
              : grinderLink === "lost"
                ? "animate-pulse border-2 border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--ink)]/20 text-[var(--ink)]/80"
          }`}>
          {grinderLink === "connecting" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bluetooth className="h-5 w-5" />}
        </button>}
      </div>
      {/* Motto 80: microns, feed and rpm. Other grinders: dial setting and optional rpm. */}
      <div className={`grid gap-2 ${motto ? "grid-cols-3" : "grid-cols-2"}`}>
        {(motto
          ? ([
            ["grindUm", "Grind", "µm", 50, 1500, GRINDER_DEFAULTS.grindUm],
            ["feed", "Feed", "", 10, 65, GRINDER_DEFAULTS.feed],
            ["rpm", "Speed", "rpm", 500, 1500, GRINDER_DEFAULTS.rpm],
          ] as const)
          : ([
            ["grindSetting", "Grind", "", 0, 10000, null],
            ["rpm", "Speed (optional)", "rpm", 0, 5000, null],
          ] as const)
        ).map(([key, name, unit, min, max, def]) => (
          <label key={key} className="flex h-14 landscape:h-12 min-w-0 flex-col justify-center rounded-md border border-[var(--ink)]/20 px-2.5">
            <span className="text-xs font-semibold uppercase leading-none tracking-wider text-[var(--ink)]/70">{name}</span>
            <span className="flex items-baseline gap-1">
            <input type="number" inputMode="decimal" step="any" min={min} max={max} disabled={!editable}
              value={recipe[key] ?? ""} placeholder={def != null ? String(def) : "—"} aria-label={name}
              onChange={(e) => {
                // Not clamped while typing (typing 150 passes through 1 and 15)
                const v = e.target.value === "" ? undefined : Number(e.target.value);
                onChange({ [key]: v != null && Number.isFinite(v) ? v : undefined } as Partial<Recipe>);
              }}
              onBlur={() => {
                const v = recipe[key];
                if (v != null) onChange({ [key]: Math.min(max, Math.max(min, v)) } as Partial<Recipe>);
              }}
              // The default (what the shot uses when left empty) reads as a value, not as a hint
              className="w-full min-w-0 bg-transparent text-lg font-extrabold leading-tight text-[var(--ink)] tabular-nums outline-none placeholder:text-[var(--ink)] disabled:opacity-60" />
            {unit && <span className="shrink-0 text-xs text-[var(--ink)]/70">{unit}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="landscape:text-xs">
        {/* Not remembered: off on every page load, so a shot never starts by surprise */}
        <AutoBrewPicker value={autoBrew} onChange={onAutoBrew} />
      </div>
    </div>
  );
}
