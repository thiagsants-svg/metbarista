"use client";

/**
 * The Station's menu (it is the app's home, so the rest of the app opens from
 * here): the other pages, the machine's details (what the old Dashboard showed,
 * read only).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coffee, History, Layers, Loader2, Menu, Target, Users, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getMachineInfo } from "@/lib/machine-api";
import { clearIp, getSavedIp } from "@/lib/connection-store";
import { APP_NAME } from "@/lib/brand";
import type { MachineInfo } from "@/lib/types";

const PAGES = [
  { href: "/shots", label: "Shots", icon: History },
  { href: "/coffees", label: "Coffees", icon: Coffee },
  { href: "/profiles", label: "Profiles", icon: Layers },
  { href: "/barista", label: "Stats", icon: Target },
  { href: "/community", label: "Community", icon: Users },
];

export function StationMenuButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Menu"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--ink)]/20 text-[var(--ink)]/70 active:scale-95">
        <Menu className="h-5 w-5" />
      </button>
      {open && <StationMenu onClose={() => setOpen(false)} />}
    </>
  );
}

function StationMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<MachineInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const ip = getSavedIp();

  useEffect(() => {
    if (!ip) return;
    getMachineInfo().then(setInfo).catch(() => setFailed(true));
  }, [ip]);

  function changeMachine() {
    clearIp();
    router.replace("/");
  }

  const row = (label: string, value: string | undefined) => (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink)]/60">{label}</p>
      <p className="truncate font-mono text-sm text-[var(--ink)]">{value || "—"}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-start bg-black/40" onClick={onClose}>
      <div className="m-2 flex max-h-[calc(100dvh-1rem)] w-full max-w-sm flex-col overflow-y-auto rounded-xl bg-[var(--paper)] p-4 text-[var(--ink)] shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8" />
          <p className="flex-1 text-lg font-bold">{APP_NAME}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink)]/60">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-3 grid grid-cols-2 gap-2">
          {PAGES.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex h-14 items-center gap-2.5 rounded-md border border-[var(--ink)]/20 px-3 text-base font-semibold active:scale-[0.98]">
              <Icon className="h-5 w-5 text-[var(--accent)]" /> {label}
            </Link>
          ))}
        </nav>

        <div className="mt-4 rounded-md border border-[var(--ink)]/15 p-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Machine</p>
          {!info && !failed && <Loader2 className="mt-2 h-5 w-5 animate-spin text-[var(--ink)]/50" />}
          {failed && <p className="mt-1 text-sm text-[var(--ink)]/70">Couldn&apos;t read the machine ({ip}).</p>}
          {info && (
            <>
              <p className="mt-1 text-base font-semibold">{info.name} <span className="font-normal text-[var(--ink)]/60">· {ip}</span></p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {row("Firmware", info.firmware)}
                {row("Serial", info.serial)}
                {row("Voltage", info.mainVoltage ? `${info.mainVoltage} V` : undefined)}
                {row("Channel", info.image_build_channel)}
                {row("Image", info.image_version?.slice(0, 14))}
                {row("Color", info.color)}
              </div>
            </>
          )}
          <button onClick={changeMachine}
            className="mt-3 h-10 w-full rounded-md border border-[var(--ink)]/25 text-sm font-semibold text-[var(--ink)]/80 active:scale-[0.98]">
            Connect another machine
          </button>
        </div>
      </div>
    </div>
  );
}
