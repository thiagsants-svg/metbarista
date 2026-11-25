import { describe, expect, it } from "vitest";
import { cupWeight } from "../cup-weight";
import type { ShotFrame } from "../types";

const f = (status: string, weight: number, i: number): ShotFrame =>
  ({ time: i * 130, profile_time: i * 130, status, shot: { pressure: 0, flow: 0, weight, gravimetric_flow: 0, setpoints: {} } }) as unknown as ShotFrame;

const shot = (after: number[]) => [
  ...[0, 5, 12, 20, 28, 33.8].map((w, i) => f("Extraction", w, i)),
  ...after.map((w, i) => f("retracting", w, 6 + i)),
];

describe("cup weight", () => {
  it("counts the last drops after the extraction", () => {
    expect(cupWeight(shot([34.4, 35.1, 35.6, 35.8, 35.8]))).toBeCloseTo(35.8);
  });

  it("ignores the cup being lifted", () => {
    expect(cupWeight(shot([34.5, 35, -2.4, -2.4]))).toBeCloseTo(35);
  });

  it("ignores the purge jug put on the scale", () => {
    expect(cupWeight(shot([34.6, 35.2, 310.4, 312]))).toBeCloseTo(35.2);
  });
});
