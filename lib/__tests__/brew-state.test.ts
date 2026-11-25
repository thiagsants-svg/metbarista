import { describe, expect, it } from "vitest";
import {
  isClickToStart, isExtracting, isHeating, isHoming, isIdle, isPurgeWait, isPurging,
  isWaitingForUser, isWaitingForWater, playAction,
} from "../brew-state";
import type { LiveStatus } from "../types";

const st = (name: string, extracting = false): LiveStatus => ({ name, state: name, profile_time: 0, extracting });

describe("brew-state: the Meticulous's state names", () => {
  it("tells extraction from the stages around it", () => {
    expect(isExtracting(st("Pressure Decline", true))).toBe(true);
    // A profile stage named like heating, mid-shot, still counts as the shot
    expect(isExtracting(st("Heat up", true))).toBe(true);
    for (const n of ["idle", "heating", "click to start", "Pour water and click to continue", "purge", "home", "retracting", "closing valve", "starting...", "boot"]) {
      expect(isExtracting(st(n, true)), n).toBe(false);
    }
    expect(isExtracting(st("Pressure Decline", false))).toBe(false);
    expect(isExtracting(null)).toBe(false);
  });

  it("names each waiting and heating state", () => {
    expect(isHeating(st("heating"))).toBe(true);
    expect(isHeating(st("Heat up", true))).toBe(false);
    expect(isClickToStart(st("Click to start"))).toBe(true);
    expect(isWaitingForWater(st("Pour water and click to continue"))).toBe(true);
    expect(isPurgeWait(st("Click to purge"))).toBe(true);
    expect(isPurgeWait(st("purge"))).toBe(false);
    expect(isWaitingForUser(st("click to start"))).toBe(true);
    expect(isWaitingForUser(st("idle"))).toBe(false);
  });

  it("names the purge and the piston going home", () => {
    expect(isPurging(st("purge"))).toBe(true);
    expect(isPurging(st("home"))).toBe(true);
    expect(isHoming(st("home"))).toBe(true);
    expect(isIdle(st("idle"))).toBe(true);
    expect(isIdle(null)).toBe(true);
  });

  it("sends continue when the machine waits for the dial's tap", () => {
    expect(playAction(st("click to start"))).toBe("continue");
    expect(playAction(st("idle"))).toBe("start");
  });
});
