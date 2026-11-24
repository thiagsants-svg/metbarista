"use client";

/**
 * Bluetooth link to the Motto 80 (read only): while it's on, the recipe's
 * grind fields follow the grinder. Reconnects by itself when the Station
 * opens or the tablet wakes, if it was on before.
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { bluetoothSupported, Motto80Link, type LinkState } from "@/lib/motto80";
import { isMotto80, loadRecipe, saveRecipe, type Recipe } from "@/lib/recipe";

const GRINDER_WANTED_KEY = "metbarista_grinder_wanted";

export function useGrinder({ grinder, setRecipe, setError, demo }: {
  /** The recipe's grinder name */
  grinder: string | undefined;
  setRecipe: Dispatch<SetStateAction<Recipe>>;
  setError: (msg: string | null) => void;
  demo: boolean;
}) {
  const [grinderLink, setGrinderLink] = useState<LinkState>("off");
  const linkRef = useRef<Motto80Link | null>(null);
  const grinderLinkRef = useRef<LinkState>("off");

  /** Opens the Bluetooth link to the Motto 80 (read only); the grind fields then follow the grinder. */
  function connectGrinder(silent = false) {
    if (!linkRef.current) {
      linkRef.current = new Motto80Link(
        (r) => setRecipe((cur) => {
          // Another grinder chosen: leave its fields alone
          if (!isMotto80(cur.grinder)) return cur;
          const next = { ...cur, grinder: cur.grinder ?? "Motto 80", grindUm: r.bladeGap, feed: r.feedingRpm, rpm: r.grindRpm };
          saveRecipe(next);
          return next;
        }),
        (state, err) => {
          grinderLinkRef.current = state;
          setGrinderLink(state);
          // Remembered, so the Station reconnects by itself when reopened
          if (state === "on") localStorage.setItem(GRINDER_WANTED_KEY, "1");
          if (err) setError(`Grinder: ${err}`);
        },
      );
    }
    linkRef.current.connect(silent).catch(() => { /* reported through the state callback */ });
  }

  // Reconnect by itself: when the Station opens and when the tablet wakes up
  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== "visible" || demo) return;
      if (localStorage.getItem(GRINDER_WANTED_KEY) !== "1" || !bluetoothSupported()) return;
      if (!isMotto80(loadRecipe().grinder) || grinderLinkRef.current === "on" || grinderLinkRef.current === "connecting") return;
      connectGrinder(true);
    };
    again();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  // connectGrinder only uses refs and setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  // Another grinder chosen: drop the Motto 80 link (frees it for the BOOKOO app)
  useEffect(() => {
    if (!isMotto80(grinder) && linkRef.current && grinderLinkRef.current !== "off") linkRef.current.disconnect();
  }, [grinder]);

  function toggleGrinder() {
    if (!bluetoothSupported()) {
      setError("Grinder: this browser has no Bluetooth for web pages (use Chrome on the tablet)");
      return;
    }
    if (grinderLink === "off" || grinderLink === "lost") {
      // "lost" waiting for a tap: this tap opens Chrome's list
      if (grinderLink === "lost") linkRef.current?.forget();
      connectGrinder();
    } else {
      localStorage.removeItem(GRINDER_WANTED_KEY);
      linkRef.current?.disconnect();
    }
  }

  /** Linked (or linking) to the grinder: its live settings win over saved ones */
  const live = () => linkRef.current != null && grinderLinkRef.current !== "off";

  return { grinderLink, linkRef, connectGrinder, toggleGrinder, live };
}
