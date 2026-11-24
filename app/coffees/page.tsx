"use client";

/**
 * Coffees: the shelf. Coffees brewed on the Station show up by themselves;
 * add new ones here with bag photos, move them to the freezer, mark them
 * finished when the bag is empty (they leave the Station's list).
 */

import { useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { useStationTheme } from "@/lib/station/use-theme";
import { listCoffees, STATUS_LABEL, type Coffee, type CoffeeStatus } from "@/lib/coffees";
import { CoffeeCard } from "@/components/coffees/coffee-card";
import { CoffeeSheet } from "@/components/coffees/coffee-sheet";

// The shelf lives in this device's storage: read it after the page loads
const noSubscribe = () => () => {};
const TABS: CoffeeStatus[] = ["open", "frozen", "finished"];

export default function CoffeesPage() {
  const { style } = useStationTheme();
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  /** Bumped after a change, to read the shelf again */
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<CoffeeStatus>("open");
  const [open, setOpen] = useState<Coffee | "new" | null>(null);

  const coffees = ready ? listCoffees() : [];
  const shown = coffees.filter((c) => c.status === tab);
  const count = (s: CoffeeStatus) => coffees.filter((c) => c.status === s).length;

  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-4 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-5">
        <div className="mb-3 flex items-center gap-3">
          <h1 className="flex-1 text-2xl font-bold">Coffees</h1>
          <button type="button" onClick={() => setOpen("new")}
            className="flex h-10 items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Add coffee
          </button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Where">
          {TABS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={chip(tab === s)}>
              {STATUS_LABEL[s]} <span className="ml-1 font-normal opacity-70">{count(s)}</span>
            </button>
          ))}
        </div>

        {!ready ? null : shown.length === 0 ? (
          <p className="py-10 text-center text-base text-[var(--ink)]/70">
            {tab === "open" ? "No coffees in use. Add one, or brew one on the Station."
              : tab === "frozen" ? "Nothing in the freezer."
              : "No finished coffees yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((c) => <CoffeeCard key={c.key} coffee={c} refresh={version} onOpen={() => setOpen(c)} />)}
          </div>
        )}
      </div>

      {open && (
        <CoffeeSheet coffee={open === "new" ? null : open} onClose={() => setOpen(null)}
          onChanged={() => setVersion((v) => v + 1)} />
      )}
    </div>
  );
}
