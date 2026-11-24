"use client";

/**
 * The app's top bar, the same on the Station and every page: menu, mark, the
 * page's title (the loaded profile on the Station), the machine's state, light
 * / dark, and page-specific buttons (the Station adds backup and full screen).
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Maximize, Minimize, Moon, Sun } from "lucide-react";
import { StationMenuButton } from "@/components/station/station-menu";
import { BackupButton } from "@/components/backup-panel";
import { BrandMark } from "@/components/brand-mark";
import type { StatusPill, ThemeName } from "@/lib/station/format";

export const headerButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95";

export function AppHeader({ title, subtitle, pill, pillHref, theme, onToggleTheme, extra }: {
  title: string;
  /** Next to the title, lighter (the Station: the profile loaded on the machine) */
  subtitle?: string;
  pill: StatusPill;
  /** Off the Station, the pill leads there */
  pillHref?: string;
  theme: ThemeName;
  onToggleTheme: () => void;
  extra?: ReactNode;
}) {
  const pillBody = (
    <>
      <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${pill.pulsing ? "animate-pulse" : ""}`} />
      <span className="truncate">{pill.text}</span>
    </>
  );
  const pillClass = `inline-flex min-w-0 max-w-[45vw] items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${pill.className}`;
  return (
    <header className="flex shrink-0 items-center gap-2.5">
      <StationMenuButton />
      <BrandMark className="hidden h-7 w-7 sm:inline-block" />
      <p className="min-w-0 flex-1 truncate text-lg">
        <span className="font-semibold">{title}</span>
        {subtitle && <span className="text-[var(--ink)]/60"> · {subtitle}</span>}
      </p>
      {pillHref
        ? <Link href={pillHref} aria-label={`Machine: ${pill.text}. Open the Station`} className={pillClass}>{pillBody}</Link>
        : <span className={pillClass}>{pillBody}</span>}
      <button aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme} className={headerButton}>
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      {extra}
    </header>
  );
}

/** The Station's bar: the app's, plus backup and full screen */
export function StationHeader(props: Omit<Parameters<typeof AppHeader>[0], "extra" | "pillHref">) {
  return <AppHeader {...props} extra={<><BackupButton /><FullscreenButton /></>} />;
}

function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return (
    <button aria-label="Full screen" className={headerButton}
      onClick={() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }}>
      {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </button>
  );
}
