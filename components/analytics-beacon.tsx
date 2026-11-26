"use client";

/**
 * Cloudflare Web Analytics (cookieless; the token is public, it only names
 * the site). Not loaded when "Don't count my use" is on (lib/usage.ts).
 */

import Script from "next/script";
import { useSyncExternalStore } from "react";
import { countingOff } from "@/lib/usage";

const noSubscribe = () => () => {};

export function AnalyticsBeacon({ token }: { token: string }) {
  // Off on the server render; decided in the browser
  const off = useSyncExternalStore(noSubscribe, countingOff, () => true);
  if (off) return null;
  return (
    <Script defer src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={`{"token": "${token}"}`} strategy="afterInteractive" />
  );
}
