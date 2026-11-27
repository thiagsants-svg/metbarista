"use client";

/**
 * News for the menu's dot: a newer firmware on the machine's own channel (from
 * Meticulous's GitHub tags, ahead of the feeds), or a company update not seen
 * yet. The text lives on Community; opening it clears the dot.
 */

import { useEffect, useState } from "react";
import { getMachineInfo } from "@/lib/machine-api";
import { firmwareNews, newestCompanyTitle, unseenCompanyUpdate } from "@/lib/firmware";

const HIDDEN_KEY = "not9bar_news_hidden";

/** Whether there is news not seen yet (read once, when `enabled` first turns on) */
export function useNewsDot(enabled: boolean): boolean {
  const [fw, setFw] = useState(false);
  const [company, setCompany] = useState(false);
  useEffect(() => {
    if (!enabled || new URLSearchParams(window.location.search).has("demo")) return;
    let alive = true;
    getMachineInfo().then(firmwareNews).then((n) => {
      if (alive) setFw(!!n && localStorage.getItem(HIDDEN_KEY) !== `fw:${n.latest}`);
    }).catch(() => {});
    newestCompanyTitle().then((t) => { if (alive) setCompany(!!unseenCompanyUpdate(t)); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return fw || company;
}

/** Community was opened: the firmware news counts as seen (the company feed marks its own) */
export function markFirmwareNewsSeen(): void {
  getMachineInfo().then(firmwareNews).then((n) => {
    if (n) localStorage.setItem(HIDDEN_KEY, `fw:${n.latest}`);
  }).catch(() => {});
}
