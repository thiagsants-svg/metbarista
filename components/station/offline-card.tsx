"use client";

/**
 * Shown in the chart's place when the machine hasn't answered for a while: the
 * IP being tried, the likely causes in order, and two ways out. A new IP is
 * saved only once it answers, so a typo never loses the working one.
 */

import { useState } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { testConnection } from "@/lib/machine-api";
import { getSavedIp, saveIp } from "@/lib/machine-ip";
import { refreshNow } from "@/lib/machine-socket";
import { FindMachineButton } from "@/components/find-machine-button";

/** "http://192.168.1.42/" → "192.168.1.42" */
export function cleanIp(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

export function OfflineCard() {
  const saved = getSavedIp();
  const [ip, setIp] = useState(saved);
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function tryIp() {
    const next = cleanIp(ip);
    if (!next) return;
    setTesting(true);
    setFailed(false);
    try {
      await testConnection(next);
      saveIp(next);
      location.reload();
    } catch {
      setFailed(true);
    }
    setTesting(false);
  }

  return (
    <div className="m-auto w-full max-w-xl rounded-lg border-2 border-[var(--ink)]/20 p-4 text-left text-[var(--ink)]">
      <p className="flex items-center gap-2 text-lg font-bold">
        <WifiOff className="h-5 w-5 shrink-0" /> Can&apos;t reach the machine{saved ? ` at ${saved}` : ""}
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--ink)]/85">
        <li><b>Off or asleep:</b> turn it on, or touch its dial to wake it.</li>
        <li><b>New IP:</b> the router may have given it another address. See it on the machine: Settings → Wi-Fi.</li>
        <li><b>Chrome blocked the local network:</b> tap the icon left of the address bar → Site settings → allow Local network access.</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <FindMachineButton lastIp={saved} onFound={(m) => { saveIp(m.ip); location.reload(); }} />
        </div>
        <button type="button" onClick={() => refreshNow()}
          className="flex h-11 items-center gap-2 rounded-md border border-[var(--ink)]/25 px-4 text-sm font-semibold active:scale-[0.97]">
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Or type the IP</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--ink)]/25 px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">IP</span>
          <input value={ip} onChange={(e) => { setIp(e.target.value); setFailed(false); }} inputMode="decimal" aria-label="Machine IP"
            className="min-w-0 flex-1 bg-transparent text-base font-semibold tabular-nums outline-none" />
        </label>
        <button type="button" onClick={tryIp} disabled={testing || !cleanIp(ip) || cleanIp(ip) === saved}
          className="flex h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] active:scale-[0.97] disabled:opacity-40">
          {testing && <Loader2 className="h-4 w-4 animate-spin" />} Use this IP
        </button>
      </div>
      {failed && <p className="mt-2 text-sm font-semibold text-[var(--accent)]">No machine answered at {cleanIp(ip)}. The saved IP was kept.</p>}
    </div>
  );
}
