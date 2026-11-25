"use client";

/**
 * Idle screen: the last shots of the selected coffee, like the official app's
 * history: tap a shot to open its chart; the newest is open. Temperature
 * shrinks to one line; the full chart comes back while heating.
 */

import { dayTime } from "@/lib/format-date";
import { sameCoffee } from "@/lib/recipe";
import { shotGrindLabel } from "@/lib/coffee-history";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Frown, Smile, Wrench } from "lucide-react";
import type { MaintenanceCount } from "@/lib/piston-store";
import { ShotPlot } from "@/components/shot-charts";
import type { CoffeeLastShot } from "@/lib/coffee-history";
import { planLines, TASTE_LABEL, type NextPlan } from "@/lib/next-plan";
import { formatRatio } from "@/lib/recipe";
import { TEMP_LABEL } from "@/lib/station/readings";

// One clock for the whole app (it rounds first: 59.6 s is "1:00", not "0:60")
import { fmtClock } from "@/lib/station/format";

/** Grind of a shot as a number to compare (µm on the Motto 80, dial setting otherwise) */
function grindValue(s: CoffeeLastShot): number | undefined {
  return s.patch.grindUm ?? s.patch.grindSetting;
}


const keyOf = (s: CoffeeLastShot) => `${s.dbKey ?? s.when}`;

export function RecentShots({
  coffee, shots, temp, target, plan, profileTip, maintenanceDue,
}: {
  /** Grease or descale past the interval set on Stats → Piston health */
  maintenanceDue?: MaintenanceCount[];
  /** The dial-in tip in the chosen profile's description, in its author's words */
  profileTip?: { name: string; tips: string[] } | null;
  coffee?: string;
  /** null while loading */
  shots: CoffeeLastShot[] | null;
  temp: number | null | undefined;
  target?: number | null;
  /** Decided after tasting this coffee's last shot */
  plan?: NextPlan | null;
}) {
  // The newest shot starts open (the parent remounts this when the list changes)
  const [open, setOpen] = useState<string | null>(shots?.[0] ? keyOf(shots[0]) : null);
  /** The profile's tip: two lines, all of it on a tap */
  const [tipOpen, setTipOpen] = useState(false);
  const name = coffee?.trim();
  const planHere = plan && sameCoffee(plan.coffee, name) ? plan : null;
  const lastRecipe = shots?.[0]?.patch;

  return (
    <div className="flex h-full w-full flex-col text-left text-[var(--ink)]">
      {/* Temperature, one line */}
      <div className="flex shrink-0 items-baseline gap-2 border-b border-[var(--ink)]/20 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">{TEMP_LABEL}</span>
        <span className="text-2xl font-extrabold tabular-nums">{temp != null ? temp.toFixed(1) : "—"}</span>
        <span className="text-sm text-[var(--ink)]/70">°C{target != null ? ` · target ${target} °C` : ""}</span>
      </div>

      {!!profileTip?.tips.length && (
        <button type="button" onClick={() => setTipOpen(!tipOpen)} aria-expanded={tipOpen}
          className="mt-2 shrink-0 rounded-md bg-[var(--ink)]/[0.04] px-3 py-1.5 text-left active:bg-[var(--ink)]/[0.08]">
          <span className={`text-sm text-[var(--ink)]/80 ${tipOpen ? "" : "line-clamp-2"}`}>
            <b className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Profile tip · {profileTip.name}</b>
            {" "}{profileTip.tips.join(" ")}
          </span>
        </button>
      )}

      {!!maintenanceDue?.length && (
        <Link href="/stats/#piston-title"
          className="mt-2 flex shrink-0 items-center gap-2 rounded-md border border-[var(--bad)]/40 bg-[var(--bad)]/10 px-3 py-1.5 text-sm active:bg-[var(--bad)]/20">
          <Wrench className="h-4 w-4 shrink-0 text-[var(--bad)]" />
          <span className="min-w-0 tabular-nums text-[var(--ink)]/85">
            {maintenanceDue.map((c, i) => (
              <span key={c.kind}>
                {i > 0 && " · "}
                <b>{c.kind === "grease" ? "Grease" : "Descale"}</b>: {c.shots} shots since {c.lastDay
                  ? new Date(`${c.lastDay}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "the first shot"} (every {c.every})
              </span>
            ))}
          </span>
        </Link>
      )}

      <p className="mt-3 shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
        {name ? `Last shots · ${name}` : shots?.length ? "Last shots · all coffees" : "Last shots"}
      </p>

      {/* The plan decided after the last shot: temperature and ratio are already in the
          recipe; grind is a reminder (the grinder is set by hand) */}
      {planHere && (
        <div className="mt-2 shrink-0 rounded-md border-2 border-[var(--accent)] bg-[var(--primary)]/15 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Plan from last shot · {TASTE_LABEL[planHere.taste]}
          </p>
          <p className="text-lg font-bold tabular-nums text-[var(--ink)]">
            {lastRecipe && planLines(lastRecipe, planHere).length
              ? planLines(lastRecipe, planHere).join(" · ")
              : "Same recipe"}
          </p>
          {planHere.grind || planHere.grindDelta ? <p className="text-sm text-[var(--ink)]/75">Set the grinder before grinding</p> : null}
        </div>
      )}

      {/* No coffee picked: the machine's latest shots, whatever the coffee */}
      {!name && !shots?.length ? (
        <p className="mt-3 text-base text-[var(--ink)]/75">{shots == null ? "Reading the machine’s history…" : "Pick a coffee to see its last shots"}</p>
      ) : shots == null ? (
        <p className="mt-3 text-sm text-[var(--ink)]/60">Reading the machine’s history…</p>
      ) : shots.length === 0 && name ? (
        <p className="mt-3 text-base text-[var(--ink)]/75">No shots yet with <b>{name}</b></p>
      ) : (
        <ol className="mt-1 flex min-h-0 flex-1 flex-col divide-y divide-[var(--ink)]/15 overflow-hidden">
          {shots.map((s, i) => {
            const older = shots[i + 1];
            const g = grindValue(s), og = older ? grindValue(older) : undefined;
            // Grind change against the shot before, only within one coffee
            const sameBeans = !!name || (older != null && older.coffee === s.coffee);
            const delta = sameBeans && g != null && og != null ? Math.round((g - og) * 10) / 10 : null;
            const p = s.patch;
            const k = keyOf(s);
            const isOpen = open === k && !!s.points?.length;
            return (
              <li key={k} className={`flex flex-col ${isOpen ? "min-h-0 flex-1" : "shrink-0"}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-baseline gap-x-5 gap-y-0.5 py-2.5 text-left active:bg-[var(--ink)]/[0.04]">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-[var(--ink)]/75">
                    {dayTime(s.when)}
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
                    {shotGrindLabel(s) ?? "—"}
                    {delta != null && delta !== 0 && (
                      <span className="ml-1 text-sm font-semibold text-[var(--accent)]">{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}{s.patch.grindUm != null ? " µm" : ""}</span>
                    )}
                  </span>
                  {!name && (
                    <span className="text-sm font-semibold text-[var(--ink)]/85">{s.coffee || "No coffee"}</span>
                  )}
                  {p.dose != null && p.ratio != null && (
                    <span className="text-sm tabular-nums text-[var(--ink)]/70">{p.dose}g {formatRatio(p.ratio)} {p.temperature}°C</span>
                  )}
                  {s.ey != null && (
                    <span className="text-sm font-semibold tabular-nums text-[var(--ink)]/80">EY {s.ey.toFixed(1)}%{s.tds != null ? ` · TDS ${s.tds.toFixed(2)}` : ""}</span>
                  )}
                  {!!s.points?.length && (
                    <ChevronDown className={`ml-auto h-5 w-5 self-center text-[var(--ink)]/60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  )}
                </button>
                {isOpen && (
                  <div className="relative min-h-[140px] flex-1 pb-2">
                    <ShotPlot data={s.points!} targetWeight={null} currentStage={null} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
