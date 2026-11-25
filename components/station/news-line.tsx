"use client";

/**
 * A line on the idle Station when there's news: a newer firmware on the
 * machine's own channel (from Meticulous's GitHub tags, ahead of the feeds), or
 * a company update not seen yet. Taps open Community; the x hides it until the
 * next one.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { getMachineInfo } from "@/lib/machine-api";
import { firmwareNews, markCompanyUpdateSeen, newestCompanyTitle, unseenCompanyUpdate, type FirmwareNews } from "@/lib/firmware";

const HIDDEN_KEY = "not9bar_news_hidden";

export function NewsLine() {
  const [fw, setFw] = useState<FirmwareNews | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  // Read when first drawn (the line only shows after the machine answers, never on the server)
  const [hidden, setHidden] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem(HIDDEN_KEY)));

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) return;
    let alive = true;
    getMachineInfo().then(firmwareNews).then((n) => { if (alive) setFw(n); }).catch(() => {});
    newestCompanyTitle().then((t) => { if (alive) setCompany(unseenCompanyUpdate(t)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Firmware and company news each on their own line; hiding one keeps the other
  const showFw = !!fw && hidden !== `fw:${fw.latest}`;
  if (!showFw && !company) return null;

  const row = (key: string, text: React.ReactNode, onHide: () => void) => (
    <div key={key} className="flex shrink-0 items-center gap-3 rounded-md border border-[var(--accent)]/40 bg-[var(--primary)]/10 py-1.5 pl-3 pr-1.5 text-sm">
      <Megaphone className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
      <Link href="/community" className="min-w-0 flex-1 text-[var(--ink)]/85">{text}</Link>
      <button type="button" aria-label="Hide this news" onClick={onHide}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--ink)]/60 active:bg-[var(--ink)]/10">
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <>
      {showFw && fw && row("fw",
        <><b>New firmware on {fw.channel}: {fw.latest}</b> (this machine has {fw.current}). Meticulous rolls it out over a few days; see what&apos;s new.</>,
        () => { const id = `fw:${fw.latest}`; localStorage.setItem(HIDDEN_KEY, id); setHidden(id); })}
      {company && row("co",
        <><b>Meticulous news:</b> {company}</>,
        () => { markCompanyUpdateSeen(company); setCompany(null); })}
    </>
  );
}
