"use client";

/**
 * Home. With a machine saved it goes straight to the Station (the app's home),
 * unless opened as "About" (/?about); without one it introduces Not Nine Bar
 * and connects the machine.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight, Bluetooth, Bot, Filter, HardDriveDownload, History, Loader2, SlidersHorizontal, Tablet, Thermometer } from "lucide-react";
import { ConnectDialog } from "@/components/connect-dialog";
import { UsageStrip } from "@/components/usage-strip";
import { BrandMark } from "@/components/brand-mark";
import { getSavedIp, saveIp, getIpFromUrlParam } from "@/lib/connection-store";
import { testConnection } from "@/lib/machine-api";
import { APP_NAME, CONTACT, REPO_URL, UPSTREAM } from "@/lib/brand";
import { DiscordContact } from "@/components/discord-contact";
import { ShotDemo } from "@/components/home/shot-demo";

const STATION = "/station";

/** In the order of what owners and reviewers miss most: following the machine, quick recipe changes, the heating */
const FEATURES = [
  { icon: Tablet, title: "Everything the machine does, on one screen", desc: "Full screen on a tablet by the machine: pressure, flow, weight and the cup live, the stage the shot is in and which condition ends it. Skip a stage with a tap." },
  { icon: SlidersHorizontal, title: "Change the recipe in seconds", desc: "Dose, ratio and temperature on big wheels, the coffee and grind beside them, then slide to heat. The profile goes with your recipe, and the retraction follows the dose." },
  { icon: Thermometer, title: "The heating, sensor by sensor", desc: "Every thermometer in the machine on one chart, with the water and the group's lowest one (Bar down, by the puck) as bars and the time left. Auto brew can wait for the Bar down. Each heating is logged, hot or cold water, to sharpen the forecast." },
  { icon: History, title: "Every shot, read from the machine", desc: "Straight from the machine's own history: each coffee's last shots, compare two, rate in one tap and set what to change next time. The plan waits for you." },
  { icon: Activity, title: "Machine health", desc: "How hard the motor works to lift the piston after every shot: see the seal dry out and the grease bring it back. A choked shot is flagged." },
  { icon: HardDriveDownload, title: "No app, no account", desc: "It runs in the tablet's browser and talks straight to the machine on your Wi-Fi: no pairing, no cloud. A backup file keeps your coffees and notes." },
  { icon: Bluetooth, title: "Grinder and refractometer", desc: "The BOOKOO Motto 80's grind goes with each shot over Bluetooth; the DiFluid R2 fills the TDS by itself, and extraction follows." },
  { icon: Filter, title: "Pour-over on the same scale", desc: "Free pour or a guided recipe on the machine's own scale: the ratio never gets lost." },
  { icon: Bot, title: "AI review, your key", desc: "Ask Claude, ChatGPT, Gemini or Grok about a shot: profile, curve and the coffee's last shots go along. The key stays on your tablet." },
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
            Espresso shouldn&apos;t be nine bar.
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
            needs Chrome too. It counts, anonymously, how many devices open it each day and how many different machines
            (by a short code that can&apos;t be turned back into the serial): no names, no coffee data. Open source:{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-[var(--ink)]/85 underline underline-offset-2 hover:text-[var(--accent)]">
              code on GitHub
            </a>.
          </p>
        </div>
      </section>

      <UsageStrip />

      {/* What it looks like: the Station's live chart on a tablet, playing a real shot on a loop */}
      <section className="border-t border-[var(--ink)]/15">
        <figure className="mx-auto max-w-4xl px-6 py-12">
          <ShotDemo />
          <figcaption className="mt-3 text-center text-sm text-[var(--ink)]/70">
            The Station&apos;s live chart during a shot: pressure, flow and the cup filling, stage by stage (a real shot, LRv2 at 20 g 1:2).
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

      {/* Talk to the maintainer */}
      <section className="border-t border-[var(--ink)]/15">
        <div className="mx-auto max-w-2xl px-6 py-10 text-center">
          <h2 className="text-lg font-semibold">Let&apos;s talk</h2>
          <p className="mt-1 text-sm text-[var(--ink)]/75">
            Ideas, bugs, profiles? I&apos;m {CONTACT.name} on Discord. Add the username as a friend, or
            find me on the Meticulous server.
          </p>
          <DiscordContact />
        </div>
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

      {/* Where it started: credited, quietly */}
      <footer className="border-t border-[var(--ink)]/15">
        <p className="mx-auto max-w-2xl px-6 py-8 text-center text-xs leading-relaxed text-[var(--ink)]/65">
          {APP_NAME} started as a fork of{" "}
          <a href={UPSTREAM.repoUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent)]">{UPSTREAM.name}</a>{" "}
          by{" "}
          <a href={UPSTREAM.authorUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent)]">{UPSTREAM.author}</a>{" "}
          (MIT License). Our code is on{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent)]">GitHub</a>.
          <br />
          An independent, unofficial app: not affiliated with or endorsed by Meticulous Home, Inc. Meticulous is their trademark.
          For problems with the machine itself, contact{" "}
          <a href="https://meticuloushome.com/pages/support" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent)]">Meticulous support</a>.
        </p>
      </footer>

      <ConnectDialog
        open={showConnect}
        onConnected={() => router.replace(STATION)}
        onCancel={() => setShowConnect(false)}
      />
    </div>
  );
}
