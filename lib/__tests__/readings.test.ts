import { describe, expect, it } from "vitest";
import { readingsOf } from "../station/readings";
import { machineBase } from "../machine-ip";
import type { LiveStatus } from "../types";

const status = (sensors: LiveStatus["sensors"]): LiveStatus => ({ name: "idle", state: "idle", profile_time: 0, sensors });

describe("readingsOf", () => {
  it("names the Meticulous's sensors", () => {
    expect(readingsOf(status({ p: 8.9, f: 2.1, w: 36.4, g: 1.9, t: 92.5 })))
      .toEqual({ pressure: 8.9, flow: 2.1, weight: 36.4, grav: 1.9, temp: 92.5 });
  });

  it("leaves a missing or broken reading out, never a 0", () => {
    const r = readingsOf(status({ p: Number.NaN, w: 0 }));
    expect(r.pressure).toBeUndefined();
    expect(r.flow).toBeUndefined();
    expect(r.weight).toBe(0);
    expect(readingsOf(null)).toEqual({});
  });
});

describe("machineBase", () => {
  it("builds the machine's address, or nothing without an IP", () => {
    expect(machineBase("192.168.1.20")).toBe("http://192.168.1.20");
    expect(machineBase("")).toBe("");
  });
});
