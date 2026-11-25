/**
 * The Station's big button follows the machine: idle → Start heating (a slide),
 * heating → progress, water → Water added, ready → Brew or Purge, brewing → the
 * clock. A pure function, so every state can be tested without a screen.
 */

import { isExtracting, isHeating, isIdle, isPurgeWait, isWaitingForUser, isWaitingForWater } from "../brew-state";
import { statusLabel } from "./format";
import type { ActionType, LiveStatus } from "../types";

export type MainTone = "start" | "water" | "brew" | "heat" | "busy" | "off";
export type MainIcon = "play" | "spinner" | "water" | "flame";

export interface MainButton {
  /** What a tap sends: an action, "load" (slide to heat), or nothing */
  action: ActionType | "load" | null;
  label: string;
  hint: string;
  icon: MainIcon;
  tone: MainTone;
}

export function mainButton({ status, connected, hasProfile, recipeHint, elapsedText }: {
  status: LiveStatus | null;
  connected: boolean;
  /** A base profile is picked (Start heating needs one) */
  hasProfile: boolean;
  /** The recipe in one line ("20g · 1:2 · 40g · 94°C · 80 ml"), shown under Start heating */
  recipeHint: string;
  /** The shot's clock, shown while brewing */
  elapsedText: string;
}): MainButton {
  const online = connected && !!status;
  const needsWater = isWaitingForWater(status);
  if (!online) return { action: null, label: "Connecting", hint: "waiting for the machine", icon: "spinner", tone: "off" };
  if (needsWater) return { action: "continue", label: "Water added", hint: "Pour the water, then tap", icon: "water", tone: "water" };
  if (isWaitingForUser(status)) {
    return { action: "continue", label: isPurgeWait(status) ? "Purge" : "Brew", hint: "Machine is ready", icon: "play", tone: "brew" };
  }
  // The temperature is on the gauge and the heating chart: no third copy here
  if (isHeating(status)) return { action: null, label: "Heating", hint: "prep the puck and cup", icon: "flame", tone: "heat" };
  if (isExtracting(status)) return { action: null, label: "Brewing", hint: elapsedText, icon: "play", tone: "busy" };
  if (isIdle(status)) {
    return hasProfile
      ? { action: "load", label: "Start heating", hint: recipeHint, icon: "play", tone: "start" }
      : { action: null, label: "Start heating", hint: "Pick a profile", icon: "play", tone: "off" };
  }
  return { action: null, label: statusLabel(status, connected), hint: "", icon: "spinner", tone: "off" };
}
