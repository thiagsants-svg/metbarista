"use client";

/**
 * The app's frame on every page but the Station (full screen, with the same
 * top bar of its own): the Station's top bar with the page's title, the
 * Station's margins, and on phones a tab bar. Colors from the Station's theme.
 */

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coffee, History, Tablet, Target } from "lucide-react";
import { AppHeader } from "@/components/station/station-header";
import { APP_NAME } from "@/lib/brand";
import { statusPill } from "@/lib/station/format";
import { useMachineStatus } from "@/lib/station/use-machine-status";
import { useStationTheme } from "@/lib/station/use-theme";
import { getSavedIp } from "@/lib/connection-store";
import { countUse, countNewDevice } from "@/lib/usage";

const noSubscribe = () => () => {};

const TABS = [
  { href: "/station", label: "Station", icon: Tablet },
  { href: "/shots", label: "Shots", icon: History },
  { href: "/coffees", label: "Coffees", icon: Coffee },
  { href: "/stats", label: "Stats", icon: Target },
];

const TITLES: [string, string][] = [
  ["/shots", "Shots"], ["/coffees", "Coffees"], ["/stats", "Stats"], ["/profiles", "Profiles"],
  ["/profile", "Profile"], ["/community", "Community"], ["/create", "New profile"], ["/import", "Import a profile"],
  ["/share", "Share a profile"], ["/compare", "Compare shots"], ["/live", "Live shot"], ["/shortcuts", "Home screen shortcut"], ["/usage", "Usage"], ["/bluetooth", "Devices"], ["/pour-over", "Pour-over"], ["/water", "Water"],
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const station = path.startsWith("/station");
  const { theme, style, toggle } = useStationTheme();
  // The Station listens to the machine itself
  const { connected, status, preheatLeft } = useMachineStatus(!station);
  // Saved on this device: read after the page loads
  const hasMachine = useSyncExternalStore(noSubscribe, () => !!getSavedIp(), () => true);
  // Anonymous count of devices using the app today (see lib/usage.ts)
  useEffect(() => { void countUse("d"); void countNewDevice(); }, []);

  if (station) return <>{children}</>;

  const title = TITLES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1] ?? APP_NAME;

  return (
    <div style={style} className="flex min-h-screen flex-col bg-[var(--paper)] text-[var(--ink)]">
      <div className="sticky top-0 z-50 bg-[var(--paper)] px-2.5 pb-2 pt-[calc(env(safe-area-inset-top)+0.625rem)] sm:px-3 sm:pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <AppHeader title={title} pill={statusPill(status, connected, preheatLeft, hasMachine)} pillHref="/station"
          theme={theme} onToggleTheme={toggle} />
      </div>

      <main className="flex-1 px-2.5 pb-[calc(env(safe-area-inset-bottom)+72px)] sm:px-3 md:pb-6">{children}</main>

      {/* Phones: the pages used most, one thumb away */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--ink)]/15 bg-[var(--paper)]/95 backdrop-blur pb-safe md:hidden">
        <div className="flex">
          {TABS.map(({ href, label, icon: Icon }) => {
            const here = path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={here ? "page" : undefined}
                className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                  here ? "text-[var(--ink)]" : "text-[var(--ink)]/60"}`}>
                {here && <span className="absolute top-0 h-1 w-10 rounded-b bg-[var(--primary)]" />}
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
