"use client";

/**
 * The app's frame on every page but the Station (which is full screen and has
 * its own header of the same kind): the Station's header (menu, name, the
 * machine's live state, light / dark) on top and, on phones, a tab bar below.
 * Colors come from the Station's theme.
 */

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coffee, History, Moon, Sun, Tablet, Target } from "lucide-react";
import { StationMenuButton } from "@/components/station/station-menu";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/brand";
import { isExtracting, isHeating, isWaitingForUser, isWaitingForWater } from "@/lib/brew-state";
import { fmtClock, statusLabel } from "@/lib/station/format";
import { useMachineStatus } from "@/lib/station/use-machine-status";
import { useStationTheme } from "@/lib/station/use-theme";
import { getSavedIp } from "@/lib/connection-store";

const noSubscribe = () => () => {};

const TABS = [
  { href: "/estacao", label: "Station", icon: Tablet },
  { href: "/shots", label: "Shots", icon: History },
  { href: "/coffees", label: "Coffees", icon: Coffee },
  { href: "/stats", label: "Stats", icon: Target },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const station = path.startsWith("/estacao");
  const { theme, style, toggle } = useStationTheme();
  // The Station listens to the machine itself
  const { connected, status, preheatLeft } = useMachineStatus(!station);
  // Saved on this device: read after the page loads
  const hasMachine = useSyncExternalStore(noSubscribe, () => !!getSavedIp(), () => true);

  if (station) return <>{children}</>;

  const busy = isExtracting(status) || isHeating(status) || isWaitingForUser(status) || isWaitingForWater(status);
  const label = !hasMachine ? "No machine"
    : preheatLeft > 0 && !busy ? `Preheating ${fmtClock(preheatLeft)}`
    : statusLabel(status, connected);
  const pill = !connected
    ? "bg-[var(--ink)]/[0.06] text-[var(--ink)]/70"
    : busy || preheatLeft > 0 ? "bg-[var(--primary)] text-[var(--on-primary)]"
    : "bg-[var(--ink)]/[0.06] text-[var(--ink)]/80";

  return (
    <div style={style} className="flex min-h-screen flex-col bg-[var(--paper)] text-[var(--ink)]">
      <header className="sticky top-0 z-50 border-b border-[var(--ink)]/15 bg-[var(--paper)]/95 backdrop-blur pt-safe">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2.5 px-3 sm:px-5">
          <StationMenuButton />
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2">
            <BrandMark className="h-7 w-7" />
            <span className="hidden truncate text-lg font-bold sm:inline">{APP_NAME}</span>
          </Link>
          {/* The machine's state, everywhere: tap to go to the Station */}
          <Link href="/estacao" aria-label={`Machine: ${label}. Open the Station`}
            className={`inline-flex max-w-[45vw] items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${pill}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${busy || preheatLeft > 0 ? "animate-pulse" : ""}`} />
            <span className="truncate">{label}</span>
          </Link>
          <button aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 pb-[calc(env(safe-area-inset-bottom)+64px)] md:pb-0">{children}</main>

      {/* Phones: the pages used most, one thumb away */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--ink)]/15 bg-[var(--paper)]/95 backdrop-blur pb-safe md:hidden">
        <div className="flex">
          {TABS.map(({ href, label: l, icon: Icon }) => {
            const here = path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={here ? "page" : undefined}
                className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  here ? "text-[var(--ink)]" : "text-[var(--ink)]/60"}`}>
                {here && <span className="absolute top-0 h-1 w-10 rounded-b bg-[var(--primary)]" />}
                <Icon className="h-5 w-5" />
                {l}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
