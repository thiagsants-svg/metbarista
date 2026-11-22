/**
 * Interpreting the machine's live status.
 *
 * The backend reports `extracting: true` for the whole profile run, including
 * the heating stage and the "click to start" wait of PUSH TO BREW. These helpers
 * tell those user-facing stages apart from real extraction, and pick the action
 * the Play button must send.
 *
 * Status names come from MeticulousHome/meticulous-backend (shots.rs,
 * machine/mod.rs).
 */

import type { ActionType, LiveStatus } from "./types";

/** Statuses where the machine is waiting for the user to press the dial. */
const WAITING_STATUSES = ["click to start", "pour water and click to continue"];

/** Statuses that are part of a profile run but are not extraction. */
const NON_EXTRACTION_STATUSES = [
  "idle",
  "heating",
  "purge",
  "home",
  "retracting",
  "closing valve",
  "starting...",
  "boot",
  ...WAITING_STATUSES,
];

function statusName(s: LiveStatus | null | undefined): string {
  return (s?.name ?? "").toLowerCase();
}

export function isWaitingForUser(s: LiveStatus | null | undefined): boolean {
  return WAITING_STATUSES.includes(statusName(s));
}

export function isHeating(s: LiveStatus | null | undefined): boolean {
  return statusName(s).includes("heat");
}

export function isIdle(s: LiveStatus | null | undefined): boolean {
  return !s || statusName(s) === "idle";
}

/** True only while coffee is actually being pulled. */
export function isExtracting(s: LiveStatus | null | undefined): boolean {
  if (!s?.extracting) return false;
  return !NON_EXTRACTION_STATUSES.includes(statusName(s));
}

/**
 * The action the Play button sends. After preheat in PUSH TO BREW mode the
 * machine ignores `start` and only proceeds on `continue` (what the dial's
 * button sends).
 */
export function playAction(s: LiveStatus | null | undefined): ActionType {
  return isWaitingForUser(s) ? "continue" : "start";
}
