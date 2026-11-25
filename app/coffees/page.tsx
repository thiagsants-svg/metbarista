"use client";

/**
 * Coffees: the shelf. Coffees brewed on the Station show up by themselves;
 * add new ones here with bag photos, move them to the freezer, mark them
 * finished when the bag is empty (they leave the Station's list).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSavedIp } from "@/lib/connection-store";
import { getHistoryLight } from "@/lib/machine-api";
import { shotSummary } from "@/lib/coffee-history";
import { Plus } from "lucide-react";
import { useStationTheme } from "@/lib/station/use-theme";
import { coffeeKey, listCoffees, STATUS_LABEL, type Coffee, type CoffeeStatus } from "@/lib/coffees";
import { CoffeeCard, type MachineCoffee } from "@/components/coffees/coffee-card";
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

  /** Coffees named in the machine's shots, newest first: the shelf fills on any device (read only) */
  const [brewed, setBrewed] = useState<string[]>([]);
  /** Per coffee: how many shots, the last one and its grind */
  const [fromMachine, setFromMachine] = useState<Record<string, MachineCoffee>>({});
  useEffect(() => {
    if (!getSavedIp()) return;
    let alive = true;
    getHistoryLight(300)
      .then((h) => {
        if (!alive) return;
        const sums = h.map((s) => shotSummary(s)).filter((s) => !!s.coffee);
        const by: Record<string, MachineCoffee> = {};
        for (const s of sums) {
          const k = coffeeKey(s.coffee);
          const grind = s.patch.grindUm != null ? `${s.patch.grindUm} µm` : s.patch.grindSetting != null ? `grind ${s.patch.grindSetting}` : null;
          if (!by[k]) by[k] = { shots: 0, when: s.when, grind };
          by[k].shots++;
        }
        setBrewed(sums.map((s) => s.coffee));
        setFromMachine(by);
      })
      .catch(() => { /* the shelf shows what this device knows */ });
    return () => { alive = false; };
  }, []);

  const coffees = ready ? listCoffees(brewed) : [];
  const shown = coffees.filter((c) => c.status === tab);
  const count = (s: CoffeeStatus) => coffees.filter((c) => c.status === s).length;

  const chip = (on: boolean) => `h-10 shrink-0 rounded-full border px-4 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1">
        <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Where">
          {TABS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={chip(tab === s)}>
              {STATUS_LABEL[s]} <span className="ml-1 font-normal opacity-70">{count(s)}</span>
            </button>
          ))}
        </div>
          <button type="button" onClick={() => setOpen("new")}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] active:scale-[0.98]">
            <Plus className="h-4 w-4" /> Add coffee
          </button>
        </div>

        {!ready ? null : shown.length === 0 ? (
          <p className="py-10 text-center text-base text-[var(--ink)]/70">
            {tab === "open" ? "No coffees in use. Add one, or brew one on the Station."
              : tab === "frozen" ? "Nothing in the freezer."
              : "No finished coffees yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {shown.map((c) => <CoffeeCard key={c.key} coffee={c} refresh={version} onOpen={() => setOpen(c)} machine={fromMachine[c.key]} />)}
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
