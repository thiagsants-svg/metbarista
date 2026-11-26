"use client";

/**
 * The maintainer's Discord username with a Copy button: Discord has no link
 * that opens a profile by username, so you add it as a friend by name.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { CONTACT } from "@/lib/brand";

export function DiscordContact() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(CONTACT.discord); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
      <span className="rounded-lg border border-[var(--ink)]/20 px-4 py-2.5 font-mono text-base">
        <span className="font-sans text-sm text-[var(--ink)]/70">Discord </span>{CONTACT.discord}
      </span>
      <button onClick={copy} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] active:scale-[0.97]">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy username"}
      </button>
      <a href="https://discord.com/app" target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-lg border border-[var(--ink)]/25 px-4 py-2 text-sm font-semibold active:scale-[0.97]">
        Open Discord
      </a>
    </div>
  );
}
