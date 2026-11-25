"use client";

/**
 * Install as app: in Chrome the Station loses about 15% of the screen to the
 * tabs and the address bar. Installed (standalone) it gets the whole screen.
 * A slim line on the idle Station until it's installed or dismissed.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { MonitorDown, X } from "lucide-react";

const DISMISSED_KEY = "metbarista_install_hint_dismissed";
const noSubscribe = () => () => {};

/** Not installed, not dismissed, not a ?demo preview (read after the page loads) */
function eligibleNow(): boolean {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches;
  return !standalone && !localStorage.getItem(DISMISSED_KEY) && !new URLSearchParams(window.location.search).has("demo");
}

/** Chrome's install prompt event (not in the DOM types) */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallHint() {
  const eligible = useSyncExternalStore(noSubscribe, eligibleNow, () => false);
  const [hidden, setHidden] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const show = eligible && !hidden;
  const setShow = (on: boolean) => setHidden(!on);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(DISMISSED_KEY, new Date().toISOString()); setShow(false); };

  return (
    <div className="flex shrink-0 items-center gap-3 rounded-md border border-[var(--ink)]/20 bg-[var(--ink)]/[0.04] py-1.5 pl-3 pr-1.5 text-sm">
      <MonitorDown className="h-5 w-5 shrink-0 text-[var(--ink)]/70" aria-hidden />
      <p className="min-w-0 flex-1 text-[var(--ink)]/85">
        <b>Install as an app</b>: the Station gets the whole screen, no tabs or address bar.
        {!prompt && <span className="text-[var(--ink)]/70"> In Chrome: ⋮ menu → Add to home screen.</span>}
      </p>
      {prompt && (
        <button type="button"
          onClick={async () => {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setShow(false);
            setPrompt(null);
          }}
          className="h-11 shrink-0 rounded-md bg-[var(--primary)] px-4 font-semibold text-[var(--on-primary)] active:scale-[0.97]">
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Hide the install hint"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--ink)]/60 active:bg-[var(--ink)]/10">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
