import { describe, expect, it } from "vitest";
import { afterShotLift, beforeAfter, outlook, summarise, weekly, weekStart } from "../piston";
import { daySec, maintenanceCounts } from "../piston-store";
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

describe("piston outlook", () => {
  const DAY = 86_400;
  // 1.50 A rising 0.01 A a day for 60 days, 3 shots a day
  const rising = Array.from({ length: 180 }, (_, i) => ({ t: 1_000_000 + Math.floor(i / 3) * DAY + (i % 3) * 3600, a: 1.5 + Math.floor(i / 3) * 0.01 }));

  it("reads the pace and when it gets due", () => {
    const o = outlook(rising, null, rising.at(-1)!.t)!;
    expect(o.base).toBeCloseTo(1.52, 1);
    expect(o.perMonth!).toBeGreaterThan(15);
    expect(o.status).toBe("soon");
    expect(o.dueIn!.days).toBeGreaterThan(10);
    expect(o.dueIn!.shots).toBeCloseTo(o.dueIn!.days * 3, -1);
  });

  it("starts again from the last maintenance, and waits for two weeks before a pace", () => {
    const after = rising.at(-1)!.t - 5 * DAY;
    const o = outlook(rising, after, rising.at(-1)!.t)!;
    expect(o.from).toBe(after);
    expect(o.perMonth).toBeNull();
    expect(o.dueIn).toBeNull();
    expect(outlook(rising.slice(0, 3), null)).toBeNull();
  });
});

describe("maintenance counter", () => {
  const times = [daySec("2026-10-01"), daySec("2026-10-05"), daySec("2026-10-06"), daySec("2026-10-07") + 3600];
  it("counts shots since the last grease logged, or since the first shot; no descale counter", () => {
    const counts = maintenanceCounts(times, [{ id: "a", day: "2026-10-06", kind: "grease" }], { grease: 2, descale: 10 });
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ kind: "grease", lastDay: "2026-10-06", shots: 2, due: true });
    expect(maintenanceCounts(times, [], { grease: 10, descale: 10 })[0]).toMatchObject({ lastDay: null, shots: 4, due: false });
  });
});
