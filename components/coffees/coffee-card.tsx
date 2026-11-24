"use client";

/** A coffee on the shelf: bag photo, name, roaster, where it is, its last shot */

import { useEffect, useState } from "react";
import { Coffee as CoffeeIcon, Snowflake } from "lucide-react";
import { listPhotos } from "@/lib/coffee-photos";
import { findLastShotForCoffee } from "@/lib/coffee-history";
import { STATUS_LABEL, type Coffee } from "@/lib/coffees";

export function CoffeeCard({ coffee, refresh, onOpen }: {
  coffee: Coffee;
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
  const grind = last?.patch.grindUm != null ? `${last.patch.grindUm} µm` : last?.patch.grindSetting != null ? `grind ${last.patch.grindSetting}` : null;

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
            {STATUS_LABEL[coffee.status]}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-base font-bold">{coffee.name}</p>
        <p className="truncate text-sm text-[var(--ink)]/70">{coffee.roaster || " "}</p>
        <p className="mt-1 truncate text-xs tabular-nums text-[var(--ink)]/60">
          {last
            ? `Last shot ${new Date(last.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${grind ? ` · ${grind}` : ""}`
            : "No shots yet"}
        </p>
      </div>
    </button>
  );
}
