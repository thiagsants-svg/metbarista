import { describe, expect, it } from "vitest";
import { mainButton } from "../station/main-button";
import type { LiveStatus } from "../types";

const st = (name: string, extracting = false): LiveStatus => ({ name, state: name, profile_time: 0, extracting });
const base = { connected: true, hasProfile: true, recipeHint: "20g · 1:2", elapsedText: "0:25" };

describe("the Station's main button", () => {
  it("waits for the machine when offline", () => {
    expect(mainButton({ ...base, status: null })).toMatchObject({ action: null, label: "Connecting", tone: "off" });
    expect(mainButton({ ...base, connected: false, status: st("idle") })).toMatchObject({ label: "Connecting" });
  });
  it("slides to heat when idle with a profile, asks for one without", () => {
    expect(mainButton({ ...base, status: st("idle") })).toMatchObject({ action: "load", label: "Start heating", hint: "20g · 1:2", tone: "start" });
    expect(mainButton({ ...base, hasProfile: false, status: st("idle") })).toMatchObject({ action: null, hint: "Pick a profile", tone: "off" });
  });
  it("follows heating, water, ready and the purge wait", () => {
    expect(mainButton({ ...base, status: st("heating", true) })).toMatchObject({ action: null, label: "Heating", tone: "heat" });
    expect(mainButton({ ...base, status: st("Pour water and click to continue", true) })).toMatchObject({ action: "continue", label: "Water added", tone: "water" });
    expect(mainButton({ ...base, status: st("click to start", true) })).toMatchObject({ action: "continue", label: "Brew", tone: "brew" });
    expect(mainButton({ ...base, status: st("Click to purge") })).toMatchObject({ action: "continue", label: "Purge" });
  });
  it("shows the clock while brewing", () => {
    expect(mainButton({ ...base, status: st("Pressure Decline", true) })).toMatchObject({ action: null, label: "Brewing", hint: "0:25", tone: "busy" });
  });
});
