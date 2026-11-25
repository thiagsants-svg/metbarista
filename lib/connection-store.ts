/**
 * Client-side connection state management
 * Persists machine IP in localStorage, provides reactive state.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { clearIp, getSavedIp, saveIp } from "./machine-ip";

// The machine's address lives in machine-ip.ts; kept here for the pages that import it from this file
export { clearIp, getSavedIp, saveIp };

/** Reads the `?ip=` query param from the current URL (client-side only). */
export function getIpFromUrlParam(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("ip") ?? "";
}


/**
 * Hook that redirects to landing if no machine is saved.
 * Use at the top of every protected page.
 */
export function useRequireConnection() {
  const router = useRouter();
  useEffect(() => {
    // ?demo pages are offline previews: they need no machine
    if (!getSavedIp() && !new URLSearchParams(window.location.search).has("demo")) {
      router.replace("/");
    }
  }, [router]);
}
