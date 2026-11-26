"use client";

/**
 * Who's using Not Nine Bar, on the home page: the project's own anonymous
 * counter (devices a day, Stations with a machine) and Cloudflare Web
 * Analytics (visits, page views), both from count.not9bar.com. Hidden when
 * the counter can't be reached.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { readSummary, type UsageSummary } from "@/lib/usage";

export function UsageStrip() {
  const [s, setS] = useState<UsageSummary | null>(null);
  useEffect(() => {
    readSummary().then(setS).catch(() => { /* counter not reachable: no strip */ });
  }, []);
  if (!s) return null;

  const tile = (label: string, value: number, sub: string) => (
    <div className="min-w-0 border-t-2 border-[var(--ink)] pt-1.5 text-left">
      <p className="text-xs uppercase tracking-wider text-[var(--ink)]/65">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums leading-tight">{value.toLocaleString("en-US")}</p>
      <p className="text-xs text-[var(--ink)]/65">{sub}</p>
    </div>
  );

  return (
    <section className="border-t border-[var(--ink)]/15">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-4 text-lg font-semibold">In use</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {tile("Today", s.today.d, "devices opened it")}
          {tile("Brewing today", s.today.s, "Stations with a Meticulous")}
          {tile("Last 7 days", s.week.d, "device-days")}
          {s.web
            ? tile("Visits, 7 days", s.web.visits, `${s.web.pageViews.toLocaleString("en-US")} page views`)
            : tile("Brewing, 7 days", s.week.s, "Station-days with a Meticulous")}
        </div>
        <p className="mt-3 text-xs text-[var(--ink)]/60">
          Counted anonymously: a device adds 1 a day, a machine a short code that can&apos;t identify it; nothing about you or your coffee.{" "}
          <Link href="/usage" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
            Daily numbers <ArrowRight className="h-3 w-3" />
          </Link>
        </p>
      </div>
    </section>
  );
}
