import { describe, expect, it } from "vitest";
import { afterShotLift, beforeAfter, summarise, weekly, weekStart } from "../piston";
import type { ShotFrame } from "../types";

const frame = (status: string, pos: number, speed: number, drive: number, amps: number, pressure = 0): ShotFrame => ({
  status,
  time: 0,
  profile_time: 0,
  shot: { pressure, flow: 0, weight: 0, gravimetric_flow: 0, setpoints: { active: null } },
  sensors: { motor_position: pos, motor_speed: speed, motor_power: drive, motor_current: amps } as ShotFrame["sensors"],
});

/** A shot: pre-shot retract, a stage, then the after-shot lift */
function shot(amps: number[]): ShotFrame[] {
  return [
    frame("idle", 0, 0, 0, 0),
    frame("retracting", 50, -20, -100, 3), // before the shot: ignored
    frame("Bloom", 60, 2, 40, 1, 3),
    frame("retracting", 70, -2, -100, 2, 4), // still under pressure
    frame("retracting", 60, -15, -100, 9), // outside the window
    ...amps.map((a, i) => frame("retracting", 54 - i * 2, -15, -100, -a)),
    frame("retracting", 40, -3, -100, 9), // slowing down
  ];
}

describe("piston after-shot lift", () => {
  it("takes the steady full-drive part after the shot", () => {
    expect(afterShotLift(shot([1.7, 1.6, 1.8, 1.7, 1.65]))).toEqual({ current: 1.7, speed: 15 });
  });

  it("needs at least 5 samples", () => {
    expect(afterShotLift(shot([1.7, 1.6, 1.8, 1.7]))).toBeNull();
  });

  it("ignores the retract before a shot", () => {
    const pre = [frame("idle", 0, 0, 0, 0), ...[1, 2, 3, 4, 5, 6].map(() => frame("retracting", 45, -15, -100, 2))];
    expect(afterShotLift(pre)).toBeNull();
  });

  it("groups by week and compares now with the start", () => {
    const day = 86_400;
    const t0 = new Date("2026-06-01T10:00:00").getTime() / 1000; // a Monday
    const readings = Array.from({ length: 40 }, (_, i) => ({ t: t0 + i * day, a: i < 20 ? 1.4 : 1.7 }));
    const w = weekly(readings);
    expect(w[0].start).toBe(weekStart(t0 * 1000));
    expect(w[0].shots).toBe(7);
    const s = summarise(readings)!;
    expect(s.first).toBe(1.4);
    expect(s.now).toBe(1.7);
    expect(Math.round(s.change)).toBe(21);
    expect(beforeAfter(readings, t0 + 20 * day)).toEqual({ before: 1.4, after: 1.7, n: 15 });
  });
});
