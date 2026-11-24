"use client";

/**
 * Idle screen: the last shots of the chosen coffee, still (no scrolling), so
 * you can compare grind, time and weight before the next shot. Temperature
 * shrinks to one line; the full chart comes back while heating.
 */

import { Frown, Smile } from "lucide-react";
import type { CoffeeLastShot } from "@/lib/coffee-history";
import { formatRatio } from "@/lib/recipe";

function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

/** Grind of a shot as a number to compare (µm on the Motto 80, dial setting otherwise) */
function grindValue(s: CoffeeLastShot): number | undefined {
  return s.patch.grindUm ?? s.patch.grindSetting;
}

function grindLabel(s: CoffeeLastShot): string {
  if (s.patch.grindUm != null) return `${s.patch.grindUm} µm`;
  if (s.patch.grindSetting != null) return `grind ${s.patch.grindSetting}`;
  return "—";
}

export function RecentShots({
  coffee, shots, temp, target,
}: {
  coffee?: string;
  /** null while loading */
  shots: CoffeeLastShot[] | null;
  temp: number | null | undefined;
  target?: number | null;
}) {
  return (
    <div className="flex h-full w-full flex-col text-left text-[var(--ink)]">
      {/* Temperature, one line */}
      <div className="flex shrink-0 items-baseline gap-2 border-b border-[var(--ink)]/20 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Group</span>
        <span className="text-2xl font-extrabold tabular-nums">{temp != null ? temp.toFixed(1) : "—"}</span>
        <span className="text-sm text-[var(--ink)]/70">°C{target != null ? ` · target ${target} °C` : ""}</span>
      </div>

      <p className="mt-3 shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
        {coffee?.trim() ? `Last shots · ${coffee.trim()}` : "Last shots"}
      </p>

      {shots == null ? (
        <p className="mt-3 text-sm text-[var(--ink)]/60">Reading the machine’s history…</p>
      ) : shots.length === 0 ? (
        <p className="mt-3 text-base text-[var(--ink)]/75">
          {coffee?.trim() ? <>No shots yet with <b>{coffee.trim()}</b></> : "No shots yet"}
        </p>
      ) : (
        <ol className="mt-1 min-h-0 flex-1 divide-y divide-[var(--ink)]/15 overflow-hidden">
          {shots.map((s, i) => {
            const older = shots[i + 1];
            const g = grindValue(s), og = older ? grindValue(older) : undefined;
            // Grind change vs the previous shot of the same coffee only
            const sameCoffee = older && s.coffee && older.coffee && s.coffee.toLowerCase() === older.coffee.toLowerCase();
            const delta = sameCoffee && g != null && og != null ? Math.round((g - og) * 10) / 10 : null;
            const p = s.patch;
            return (
              <li key={`${s.dbKey ?? s.when}`} className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5 py-2.5">
                <span className="w-24 shrink-0 text-sm tabular-nums text-[var(--ink)]/75">
                  {new Date(s.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" · "}
                  {new Date(s.when).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
                <span className="flex w-7 shrink-0 self-center justify-center" aria-label={s.face === "like" ? "Liked" : s.face === "dislike" ? "Didn't like" : "Not rated"}>
                  {s.face === "like" && <Smile className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.75} />}
                  {s.face === "dislike" && <Frown className="h-6 w-6 text-[var(--ink)]/80" strokeWidth={1.75} />}
                </span>
                <span className="text-xl font-extrabold tabular-nums">
                  {s.weight.toFixed(1)}<span className="ml-0.5 text-sm font-medium text-[var(--ink)]/70">g</span>
                </span>
                <span className="text-xl font-extrabold tabular-nums">{fmtClock(s.seconds)}</span>
                <span className="text-xl font-extrabold tabular-nums">
                  {grindLabel(s)}
                  {delta != null && delta !== 0 && (
                    <span className="ml-1 text-sm font-semibold text-[var(--accent)]">{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}</span>
                  )}
                </span>
                {p.dose != null && p.ratio != null && (
                  <span className="text-sm tabular-nums text-[var(--ink)]/70">{p.dose}g {formatRatio(p.ratio)} {p.temperature}°C</span>
                )}
                {!coffee?.trim() && s.coffee && <span className="text-sm text-[var(--ink)]/70">{s.coffee}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
