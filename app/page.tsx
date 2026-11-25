"use client";

/**
 * Home. With a machine saved it goes straight to the Station (the app's home),
 * unless opened as "About" (/?about); without one it introduces Not Nine Bar
 * and connects the machine.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Bluetooth, ClipboardList, Droplets, HardDriveDownload, Loader2, Tablet, TrendingUp } from "lucide-react";
import { ConnectDialog } from "@/components/connect-dialog";
import { UsageStrip } from "@/components/usage-strip";
import { BrandMark } from "@/components/brand-mark";
import { getSavedIp, saveIp, getIpFromUrlParam } from "@/lib/connection-store";
import { testConnection } from "@/lib/machine-api";
import { APP_NAME, REPO_URL, UPSTREAM } from "@/lib/brand";
import { ShotDemo } from "@/components/home/shot-demo";

const STATION = "/station";

const FEATURES = [
  { icon: Tablet, title: "A station by the machine", desc: "Full screen on a tablet: recipe wheels, slide to heat, live curve with the stage the shot is in and what it aims for." },
  { icon: Bluetooth, title: "Grinder on the record", desc: "The BOOKOO Motto 80 is read over Bluetooth: the grind at the moment you brew goes with the shot." },
  { icon: Droplets, title: "Refractometer", desc: "The DiFluid R2 fills the TDS by itself; extraction yield and the brew chart follow." },
  { icon: ClipboardList, title: "Next shot, decided at the cup", desc: "Taste, then set temperature and ratio for next time. The plan waits for you when you pick that coffee again." },
  { icon: TrendingUp, title: "Every coffee's story", desc: "Last shots of each coffee with curve, grind, like or dislike, TDS and EY." },
  { icon: HardDriveDownload, title: "Yours, on your tablet", desc: "No account, no cloud: it talks straight to the machine. A backup file keeps your coffees and notes." },
];

export default function HomePage() {
  const router = useRouter();
  const [showConnect, setShowConnect] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // ?ip= in the URL (home screen shortcut): save it and open the Station
    const urlIp = getIpFromUrlParam().trim();
    // A home-screen shortcut with ?ip=: only a plain address or name, and only once the machine
    // answers there (a link from anywhere must not repoint the tablet)
    if (urlIp && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(urlIp)) {
      testConnection(urlIp)
        .then(() => { saveIp(urlIp); router.replace(STATION); })
        .catch(() => setChecking(false));
      return;
    }
    const ip = getSavedIp();
    // "About" from the menu: stay here
    const q = new URLSearchParams(window.location.search);
    // "Change machine" from the menu: the connect dialog opens, with the current IP
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once, after the page loads
    if (q.has("connect")) setShowConnect(true);
    if (!ip || q.has("about")) { setChecking(false); return; }
    testConnection(ip)
      .then(() => router.replace(STATION))
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] bg-[var(--paper)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] bg-[var(--paper)] text-[var(--ink)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* A pressure curve that is not flat at nine */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 overflow-hidden">
          <svg className="w-full opacity-[0.18]" viewBox="0 0 1200 160" preserveAspectRatio="none">
            <line x1="0" y1="70" x2="1200" y2="70" stroke="var(--ink)" strokeWidth="1" strokeDasharray="6 8" opacity="0.5" />
            <path d="M0,150 C120,150 160,40 260,40 S420,95 520,95 S640,30 760,30 S980,110 1200,120"
              fill="none" stroke="var(--accent)" strokeWidth="3" />
          </svg>
        </div>
        <div className="relative mx-auto max-w-3xl px-6 pt-20 pb-28 text-center">
          <BrandMark className="mx-auto mb-6 h-16 w-16" />
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-5">{APP_NAME}</h1>
          <p className="text-xl text-[var(--ink)]/85 max-w-xl mx-auto mb-3 leading-snug">
            Espresso is not nine bar.
          </p>
          <p className="text-base text-[var(--ink)]/75 max-w-xl mx-auto mb-10 leading-relaxed">
            A station for the Meticulous: recipe, grinder, refractometer and every shot&apos;s curve,
            on a tablet next to the machine.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => setShowConnect(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-7 py-3.5 text-base font-bold text-[var(--on-primary)] hover:bg-[var(--primary)]/85 active:scale-[0.98] transition-all">
              Connect my machine
            </button>
            <Link href="/profiles"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--ink)]/15 px-7 py-3.5 text-base font-medium text-[var(--ink)]/85 hover:bg-[var(--ink)]/[0.06] hover:text-[var(--ink)] transition-all">
              Browse profiles <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mx-auto mt-6 max-w-xl rounded-lg border border-[var(--ink)]/20 px-4 py-2.5 text-sm text-[var(--ink)]/85">
            <b>Doesn&apos;t work on iPhone or iPad.</b>{" "}Safari doesn&apos;t let a website talk to devices on your
            local network (and every browser on iOS runs on Safari&apos;s engine), so it can&apos;t reach the machine.
            Use Chrome on Android or a computer.
          </p>
          <p className="mt-3 text-xs text-[var(--ink)]/65">
            Runs in the browser, straight to your machine on the local network. Bluetooth (grinder, refractometer)
            needs Chrome too. It counts, anonymously, how many devices open it each day: no names, no machine or
            coffee data. Open source:{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-[var(--ink)]/85 underline underline-offset-2 hover:text-[var(--accent)]">
              code on GitHub
            </a>.
          </p>
        </div>
      </section>

      <UsageStrip />

      {/* What it looks like: the Station's live chart on a tablet, playing the demo shot on a loop */}
      <section className="border-t border-[var(--ink)]/15">
        <figure className="mx-auto max-w-4xl px-6 py-12">
          <ShotDemo />
          <figcaption className="mt-3 text-center text-sm text-[var(--ink)]/70">
            The Station&apos;s live chart during a shot: pressure, flow and the cup filling, stage by stage (a demo shot).
          </figcaption>
        </figure>
      </section>

      {/* What it does */}
      <section className="border-t border-[var(--ink)]/15">
        <div className="mx-auto max-w-5xl px-6 py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-5">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/20 text-[var(--accent)]">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="font-semibold mb-1.5">{title}</h3>
              <p className="text-sm text-[var(--ink)]/75 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Credits */}
      <section className="border-t border-[var(--ink)]/15">
        <p className="mx-auto max-w-2xl px-6 py-12 text-center text-sm leading-relaxed text-[var(--ink)]/75">
          {APP_NAME} is built on{" "}
          <a href={UPSTREAM.siteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--ink)]/85 underline underline-offset-2 hover:text-[var(--accent)]">{UPSTREAM.name}</a>,
          the open control center for Meticulous machines by{" "}
          <a href={UPSTREAM.authorUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ink)]/85 underline underline-offset-2 hover:text-[var(--accent)]">{UPSTREAM.author}</a>.
          The shot charts, profiles and machine connection come from his work, under the MIT License. Our code is on{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--ink)]/85 underline underline-offset-2 hover:text-[var(--accent)]">GitHub</a>.
        </p>
      </section>

      {/* Ecosystem */}
      <section className="border-t border-[var(--ink)]/15">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-lg font-semibold mb-5">The Meticulous world</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { title: "metprofiles.link", desc: "Community profiles to browse and load", href: "https://metprofiles.link" },
              { title: "Discord", desc: "The unofficial Meticulous community", href: "https://discord.gg/w48ha2h3" },
              { title: "MeticulousHome", desc: "Open-source firmware, backend and API clients", href: "https://github.com/MeticulousHome" },
            ].map(({ title, desc, href }) => (
              <a key={title} href={href} target="_blank" rel="noopener noreferrer"
                className="group flex items-start gap-3 rounded-xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-4 hover:border-[var(--ink)]/30 transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium group-hover:text-[var(--accent)] transition-colors">{title}</p>
                  <p className="text-xs text-[var(--ink)]/75 mt-1 leading-relaxed">{desc}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--ink)]/65 group-hover:text-[var(--accent)] shrink-0 mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <ConnectDialog
        open={showConnect}
        onConnected={() => router.replace(STATION)}
        onCancel={() => setShowConnect(false)}
      />
    </div>
  );
}
