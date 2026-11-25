"use client";

/**
 * "Find machine": searches the network for a Meticulous, with a progress bar
 * and calm messages that change every few seconds, so a search of a minute or
 * two never looks stuck. Colors follow the text around it, so it sits on the
 * Station's paper and in the dark connect dialog alike.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { findMachine, type FoundMachine, type SearchProgress } from "@/lib/find-machine";

/** Shown in turn while searching, one every few seconds */
const CALM = [
  "Looking for your machine on this Wi-Fi…",
  "Knocking on every door in the building. Politely.",
  "Asking each gadget: \"are you an espresso machine?\" So far, a lot of no.",
  "The fridge says it's not a Meticulous. We believe it.",
  "Only asking, never touching: nothing changes on any device.",
  "Good espresso takes about 30 seconds. So can finding the machine.",
  "Still looking. Your machine is probably just pre-infusing.",
  "Checking under the sofa cushions of your network…",
  "Not nine bar, not nine seconds. Hang in there.",
  "Most machines turn up in the first minute. Yours is shy.",
];

export function FindMachineButton({ lastIp, onFound }: {
  lastIp?: string | null;
  /** A machine answered (the caller saves its IP) */
  onFound: (m: FoundMachine) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [found, setFound] = useState<FoundMachine | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // The calm messages change every 4 s while searching
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, [busy]);

  async function search() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setNotFound(false);
    setFound(null);
    setTick(0);
    const hit = await findMachine(lastIp, setProgress, ac.signal);
    if (ac.signal.aborted) return;
    setBusy(false);
    setProgress(null);
    if (hit) { setFound(hit); onFound(hit); } else setNotFound(true);
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
    setProgress(null);
  }

  const share = progress && progress.total ? progress.done / progress.total : 0;
  const what = !progress ? "Starting…"
    : progress.askingPermission ? "If Chrome asks to find devices on your network, tap Allow."
    : progress.current[0]?.endsWith(".local") ? `Trying the machine's name, ${progress.current[0]}…`
    : progress.network ? `Your network is ${progress.network}.x: checking it address by address.`
    : `Checking ${progress.current.map((r) => `${r}.x`).join(" and ")}`;

  const line = { borderColor: "color-mix(in srgb, currentColor 25%, transparent)" };
  return (
    <div className="w-full">
      <button type="button" onClick={busy ? stop : search} style={line}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-semibold active:scale-[0.98]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {busy ? "Searching… tap to stop" : "Find machine on this network"}
      </button>
      {busy && (
        <div className="mt-2" aria-live="polite">
          <div role="progressbar" aria-label="Search progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
            className="h-3 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, currentColor 15%, transparent)" }}>
            <div className="h-full rounded-full bg-[var(--primary,#ffc400)] transition-[width] duration-300 motion-safe:animate-bar-stripes"
              style={{
                width: `${Math.max(4, share * 100)}%`,
                backgroundImage: "linear-gradient(135deg, rgb(255 255 255 / 0.28) 25%, transparent 25%, transparent 50%, rgb(255 255 255 / 0.28) 50%, rgb(255 255 255 / 0.28) 75%, transparent 75%, transparent)",
                backgroundSize: "20px 20px",
              }} />
          </div>
          <p className="mt-1.5 text-sm font-semibold">{CALM[tick % CALM.length]}</p>
          <p className="text-xs tabular-nums opacity-70">
            {what}{progress && !progress.askingPermission && progress.done > 0 ? ` · ${progress.done} addresses checked` : ""}
          </p>
        </div>
      )}
      {found && <p className="mt-2 text-sm font-semibold">Found {found.name} at {found.ip}. Connecting…</p>}
      {notFound && (
        <p className="mt-2 text-sm opacity-80">
          No machine answered. Check that it&apos;s on and on this Wi-Fi, or type its IP below (Settings → Wi-Fi on the machine).
        </p>
      )}
    </div>
  );
}
