"use client";

/**
 * How many devices used Not Nine Bar each day (anonymous counts, see
 * lib/usage.ts). Not in the menus: open not9bar.com/usage.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { readUsage, type UsageDay } from "@/lib/usage";

const DAYS = 14;
const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function UsagePage() {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readUsage(DAYS).then(setDays).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const max = Math.max(1, ...(days ?? []).map((d) => d.devices));
  const total = (k: "devices" | "station") => (days ?? []).reduce((n, d) => n + d[k], 0);

  return (
    <div className="pt-1">
      <p className="text-sm text-[var(--ink)]/70">
        Devices that opened Not Nine Bar each day (UTC), and how many of them used the Station connected to a machine.
        Counted once per device a day, anonymously; your own devices count too.
      </p>

      {error ? (
        <p className="py-10 text-base text-[var(--ink)]/75">Couldn&apos;t read the counters: {error}</p>
      ) : !days ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" /></div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
            <div className="border-t-2 border-[var(--ink)] pt-1.5">
              <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">Device-days, {DAYS} days</p>
              <p className="text-3xl font-extrabold tabular-nums">{total("devices")}</p>
            </div>
            <div className="border-t-2 border-[var(--ink)] pt-1.5">
              <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">With a machine</p>
              <p className="text-3xl font-extrabold tabular-nums">{total("station")}</p>
            </div>
          </div>

          <ol className="mt-5 space-y-1.5">
            {days.map((d) => (
              <li key={d.day} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm tabular-nums text-[var(--ink)]/75">{fmtDay(d.day)}</span>
                <div className="relative h-6 flex-1 rounded-sm bg-[var(--ink)]/[0.06]">
                  <div className="absolute inset-y-0 left-0 rounded-sm bg-[var(--primary)]" style={{ width: `${(d.devices / max) * 100}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-sm bg-[var(--ink)]/60" style={{ width: `${(d.station / max) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                  <b>{d.devices}</b><span className="text-[var(--ink)]/60"> · {d.station}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-[var(--ink)]/60">
            Yellow: devices · dark: with a machine on the Station
          </p>
        </>
      )}
    </div>
  );
}
