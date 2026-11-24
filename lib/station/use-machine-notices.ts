"use client";

/**
 * Machine messages waiting for an answer (e.g. motor strain), oldest first.
 * Loaded when the Station opens, re-checked every 5 s so a message answered
 * on the dial also closes here (read only); new ones also arrive over the
 * live socket (see `onSocketNotice`).
 */

import { useEffect, useRef, useState } from "react";
import { acknowledgeNotification, getNotifications, type MachineNotification } from "@/lib/machine-api";
import { getSavedIp } from "@/lib/connection-store";

export function useMachineNotices(setError: (msg: string | null) => void) {
  const [notices, setNotices] = useState<MachineNotification[]>([]);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const demoNoticeRef = useRef(false);
  const answeredRef = useRef(new Set<string>());

  useEffect(() => {
    if (!getSavedIp()) return;
    let alive = true;
    if (new URLSearchParams(window.location.search).has("demo")) return;
    const check = () => {
      if (demoNoticeRef.current) return;
      getNotifications()
        .then((list) => {
          if (alive) setNotices((Array.isArray(list) ? list : []).filter((n) => !answeredRef.current.has(n.id)));
        })
        .catch(() => { /* machine unreachable: keep what we have */ });
    };
    check();
    const id = setInterval(check, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  /** A message pushed by the live socket (only uses refs and setters: safe to keep from the first render) */
  function onSocketNotice(n: MachineNotification) {
    if (answeredRef.current.has(n.id)) return;
    setNotices((prev) => prev.some((x) => x.id === n.id)
      ? prev.map((x) => (x.id === n.id ? { ...x, ...n } : x))
      : [...prev, n]);
  }

  /** /estacao/?demo=notice previews a machine message (answering it here sends nothing) */
  function showDemoNotice() {
    demoNoticeRef.current = true;
    setNotices([{
      id: "demo",
      message: "Brewing has been disabled because of a recent high strain on the motor, let it rest for 5 more minutes",
      responses: ["Ok"],
    }]);
  }

  async function respondToNotice(n: MachineNotification, response: string) {
    if (n.id === "demo") { setNotices((prev) => prev.filter((x) => x.id !== n.id)); return; }
    setNoticeBusy(true);
    try {
      answeredRef.current.add(n.id);
      await acknowledgeNotification(n.id, response);
    } catch (e) {
      answeredRef.current.delete(n.id);
      setError(`Couldn't answer the machine message: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // Answered: drop it here (a failed answer stays, and the 5 s check brings it back)
      if (answeredRef.current.has(n.id)) setNotices((prev) => prev.filter((x) => x.id !== n.id));
      setNoticeBusy(false);
    }
  }

  return { notices, noticeBusy, respondToNotice, onSocketNotice, showDemoNotice };
}
