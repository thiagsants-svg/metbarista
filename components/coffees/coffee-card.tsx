"use client";

/**
 * A coffee on the shelf, as a compact row: a small bag photo when there is
 * one, name, roaster, where it is, its last shot, and a quick "Archive" for
 * the bag that just ran out.
 */

import { Archive, ChevronRight, Snowflake } from "lucide-react";
import { findLastShotForCoffee } from "@/lib/coffee-history";
import { daysAgo, STATUS_LABEL, type Coffee } from "@/lib/coffees";

/** What the machine's shots say about a coffee (read on the Coffees page) */
export interface MachineCoffee { shots: number; when: number; grind: string | null }

/** "11 shots · last Nov 27 · 130 µm": the newer of this device's record and the machine's */
function lastShotLine(coffee: Coffee, machine?: MachineCoffee): string {
  // This device's record of the coffee's last shot (no machine call)
  const last = findLastShotForCoffee(coffee.name, [], []);
  const localGrind = last?.patch.grindUm != null ? `${last.patch.grindUm} µm` : last?.patch.grindSetting != null ? `grind ${last.patch.grindSetting}` : null;
  const useMachine = !!machine && (!last || machine.when >= last.when);
  const lastWhen = useMachine ? machine!.when : last?.when;
  const grind = useMachine ? machine!.grind : localGrind;
  return lastWhen
    ? `${machine ? `${machine.shots} shot${machine.shots === 1 ? "" : "s"} · ` : ""}last ${new Date(lastWhen).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${grind ? ` · ${grind}` : ""}`
    : "No shots yet";
}

/** "Frozen bag", "3 doses left", "Archived" (nothing while in use) */
function statusBadge(coffee: Coffee): React.ReactNode {
  if (coffee.status === "open") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--paper)]/90 px-2 py-0.5 text-xs font-semibold ring-1 ring-[var(--ink)]/15">
      {coffee.status === "frozen" && <Snowflake className="h-3.5 w-3.5" />}
      {coffee.status !== "frozen" ? STATUS_LABEL[coffee.status]
        : coffee.freezeMode === "bag" ? "Frozen bag"
        : coffee.doses != null ? `${coffee.doses} dose${coffee.doses === 1 ? "" : "s"} left` : "Frozen doses"}
    </span>
  );
}

/** A coffee as a row, with its bag photo small when it has one */
export function CoffeeRow({ coffee, cover, onOpen, onArchive, machine }: {
  coffee: Coffee;
  /** The first bag photo, if any */
  cover?: string | null;
  machine?: MachineCoffee;
  onOpen: () => void;
  /** One tap when the bag is empty (not shown once archived) */
  onArchive?: () => void;
}) {
  return (
    <div className={`flex items-stretch border-b border-[var(--ink)]/10 last:border-b-0 ${coffee.status === "finished" ? "opacity-60" : ""}`}>
      <button type="button" onClick={onOpen} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left active:bg-[var(--ink)]/[0.05]">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-bold">{coffee.name}</span>
            {statusBadge(coffee)}
          </span>
          <span className="block truncate text-sm tabular-nums text-[var(--ink)]/70">
            {[coffee.roaster, coffee.status === "open" && coffee.thawedAt ? `thawed ${daysAgo(coffee.thawedAt)}` : null, lastShotLine(coffee, machine)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--ink)]/40" />
      </button>
      {onArchive && (
        <button type="button" onClick={onArchive} aria-label={`Archive ${coffee.name}: the bag is finished`}
          className="flex min-w-20 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--ink)]/10 px-3 text-xs font-semibold text-[var(--ink)]/70 active:bg-[var(--ink)]/[0.05]">
          <Archive className="h-5 w-5" /> Archive
        </button>
      )}
    </div>
  );
}
