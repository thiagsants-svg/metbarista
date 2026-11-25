"use client";

/** A coffee on the shelf: bag photo, name, roaster, where it is, its last shot */

import { useEffect, useState } from "react";
import { Coffee as CoffeeIcon, Snowflake } from "lucide-react";
import { listPhotos } from "@/lib/coffee-photos";
import { findLastShotForCoffee } from "@/lib/coffee-history";
import { daysAgo, STATUS_LABEL, type Coffee } from "@/lib/coffees";

/** What the machine's shots say about a coffee (read on the Coffees page) */
export interface MachineCoffee { shots: number; when: number; grind: string | null }

export function CoffeeCard({ coffee, refresh, onOpen, machine }: {
  coffee: Coffee;
  /** From the machine's shots: counts on any device, not only where the shots were made */
  machine?: MachineCoffee;
  /** Changes when photos may have changed */
  refresh: number;
  onOpen: () => void;
}) {
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listPhotos(coffee.key).then((p) => { if (alive) setCover(p[0]?.dataUrl ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [coffee.key, refresh]);
  // This device's record of the coffee's last shot (no machine call)
  const last = findLastShotForCoffee(coffee.name, [], []);
  const localGrind = last?.patch.grindUm != null ? `${last.patch.grindUm} µm` : last?.patch.grindSetting != null ? `grind ${last.patch.grindSetting}` : null;
  // The newer of the two records
  const useMachine = !!machine && (!last || machine.when >= last.when);
  const lastWhen = useMachine ? machine!.when : last?.when;
  const grind = useMachine ? machine!.grind : localGrind;

  return (
    <button type="button" onClick={onOpen}
      className={`flex w-full flex-col overflow-hidden rounded-md border border-[var(--ink)]/15 text-left active:scale-[0.99] ${
        coffee.status === "finished" ? "opacity-60" : ""}`}>
      <div className="relative aspect-[4/3] w-full bg-[var(--ink)]/[0.06]">
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" className="h-full w-full object-cover" />
          : <CoffeeIcon className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-[var(--ink)]/25" strokeWidth={1.5} />}
        {coffee.status !== "open" && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--paper)]/90 px-2 py-0.5 text-xs font-semibold">
            {coffee.status === "frozen" && <Snowflake className="h-3.5 w-3.5" />}
            {coffee.status !== "frozen" ? STATUS_LABEL[coffee.status]
              : coffee.freezeMode === "bag" ? "Frozen bag"
              : coffee.doses != null ? `${coffee.doses} dose${coffee.doses === 1 ? "" : "s"} left` : "Frozen doses"}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-base font-bold">{coffee.name}</p>
        <p className="truncate text-sm text-[var(--ink)]/70">{coffee.roaster || " "}</p>
        {coffee.status === "open" && coffee.thawedAt && (
          <p className="truncate text-xs font-semibold text-[var(--accent)]">Thawed {daysAgo(coffee.thawedAt)}</p>
        )}
        <p className="mt-1 truncate text-sm tabular-nums text-[var(--ink)]/70">
          {lastWhen
            ? `${machine ? `${machine.shots} shot${machine.shots === 1 ? "" : "s"} · ` : ""}last ${new Date(lastWhen).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${grind ? ` · ${grind}` : ""}`
            : "No shots yet"}
        </p>
      </div>
    </button>
  );
}
