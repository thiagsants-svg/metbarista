import { describe, expect, it } from "vitest";
import { frame, joinFrame, parseReading } from "../motto80";

// A real broadcast from the grinder (captured 2026-11-23)
const BROADCAST = {
  broadcast: {
    periodInfo: {
      feedingRpm: 65, feedingRpmDynamicMax: 65, bladeGap: 150, grindRpm: 1000, humidity: 0, devState: "IDLE",
      netState: "CONNECTED", totalGrinds: 34, cupDetect: true, autoStop: true, adjustmentPurge: true, fastClean: true,
      brightness: 5, standbySec: 600, selectPreset: -1,
    },
  },
};

describe("Motto 80 frames", () => {
  it("writes the app's hello frame byte for byte", () => {
    const f = frame({ request: { appHello: { op: "handshake" } } });
    // a5 01 <seq> 00 <length u32 LE> JSON (from the official app's traffic)
    expect(Array.from(f.subarray(0, 8))).toEqual([0xa5, 0x01, 0x00, 0x00, 0x2b, 0x00, 0x00, 0x00]);
    expect(new TextDecoder().decode(f.subarray(8))).toBe('{"request":{"appHello":{"op":"handshake"}}}');
  });

  it("reads a whole frame", () => {
    const { text, rest } = joinFrame(new Uint8Array(0), frame(BROADCAST));
    expect(rest.length).toBe(0);
    expect(parseReading(text!, null)).toEqual({ bladeGap: 150, feedingRpm: 65, grindRpm: 1000, devState: "IDLE", totalGrinds: 34 });
  });

  it("joins a frame that arrives in 20-byte pieces", () => {
    const f = frame(BROADCAST);
    let pending: Uint8Array = new Uint8Array(0);
    let text: string | null = null;
    for (let i = 0; i < f.length; i += 20) {
      const r = joinFrame(pending, f.subarray(i, i + 20));
      pending = r.rest;
      if (r.text) text = r.text;
    }
    expect(parseReading(text!, null)?.bladeGap).toBe(150);
  });

  it("drops pieces that don't start a frame", () => {
    expect(joinFrame(new Uint8Array(0), new Uint8Array([0x49, 0x04, 0x01, 0x01, 0x09]))).toEqual({ rest: new Uint8Array(0), text: null });
  });

  it("keeps previous feed and rpm when a message is cut short", () => {
    const prev = { bladeGap: 140, feedingRpm: 60, grindRpm: 1100 };
    expect(parseReading('{"broadcast":{"periodInfo":{"bladeGap":145', prev)).toMatchObject({ bladeGap: 145, feedingRpm: 60, grindRpm: 1100 });
  });

  it("ignores other messages", () => {
    expect(parseReading('{"response":{"grindPreset":{"data":[{"bladeGap":160}]}}}', null)).toBeNull();
  });
});
