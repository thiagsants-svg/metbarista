"use client";

/** Station top bar: menu (other pages, machine, credits), loaded profile, status pill, theme, backup, full screen */

import { useEffect, useState } from "react";
import { Maximize, Minimize, Moon, Sun } from "lucide-react";
import { StationMenuButton } from "@/components/station/station-menu";
import { BackupButton } from "@/components/backup-panel";
import type { ThemeName } from "@/lib/station/format";

export function StationHeader({ title, statusText, pillClass, pulsing, theme, onToggleTheme }: {
  title: string;
  statusText: string;
  pillClass: string;
  /** The status dot pulses while something is happening */
  pulsing: boolean;
  theme: ThemeName;
  onToggleTheme: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return (
    <header className="flex shrink-0 items-center gap-2.5">
      <StationMenuButton />
      <p className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</p>
      <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${pillClass}`}>
        <span className={`h-2 w-2 rounded-full bg-current ${pulsing ? "animate-pulse" : ""}`} />
        {statusText}
      </span>
      <button aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <BackupButton />
      <button onClick={toggleFullscreen} aria-label="Full screen"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/60 active:scale-95">
        {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </button>
    </header>
  );
}
