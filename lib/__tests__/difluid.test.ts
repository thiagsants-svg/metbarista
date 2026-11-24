import { describe, expect, it } from "vitest";
import { difluidFrame, hex, parseDifluidTds, SINGLE_TEST, splitFrames } from "../difluid";

const bytes = (hex: string) => new Uint8Array(hex.trim().split(/\s+/).map((h) => parseInt(h, 16)));

describe("DiFluid R2 frames", () => {
  it("builds commands like DiFluid's protocol document", () => {
    // Examples from github.com/DiFluid/difluid-sdk-demo/docs/protocolR2.md
    expect(Array.from(difluidFrame(0, 0))).toEqual(Array.from(bytes("DF DF 00 00 00 BE"))); // Get SN
    expect(Array.from(difluidFrame(1, 2, [0x64]))).toEqual(Array.from(bytes("DF DF 01 02 01 64 26"))); // brightness 100
    expect(Array.from(SINGLE_TEST)).toEqual(Array.from(bytes("DF DF 03 00 00 C1")));
  });

  it("reads the TDS from a single-test result (package 2)", () => {
    // Concentration 9.53 % → 953 = 0x03B9; refractive index bytes after it
    const f = difluidFrame(3, 0, [2, 0x03, 0xb9, 0x00, 0x00]);
    expect(parseDifluidTds(f)).toBe(9.53);
  });

  it("reads the average from an average-test result (package 3)", () => {
    expect(parseDifluidTds(difluidFrame(3, 1, [3, 0x03, 0xe8, 0, 0]))).toBe(10);
    // Package 2 of an average test is one reading, not the result
    expect(parseDifluidTds(difluidFrame(3, 1, [2, 0x03, 0xe8, 0, 0]))).toBeNull();
  });

  it("ignores status, temperature, settings and broken frames", () => {
    expect(parseDifluidTds(difluidFrame(3, 0, [0, 0]))).toBeNull(); // test status
    expect(parseDifluidTds(difluidFrame(3, 0, [1, 0, 250, 0, 240, 0]))).toBeNull(); // temperatures
    expect(parseDifluidTds(bytes("DF DF 01 02 01 64 26"))).toBeNull(); // a setting
    const bad = difluidFrame(3, 0, [2, 0x03, 0xb9, 0, 0]);
    bad[bad.length - 1] ^= 0xff; // wrong checksum
    expect(parseDifluidTds(bad)).toBeNull();
    expect(parseDifluidTds(bytes("49 04 01 01 09"))).toBeNull();
  });
});

describe("frames split or joined across notifications", () => {
  // From DiFluid's protocol document: status, temperature, result (0.79 %)
  const status = bytes("DF DF 03 00 03 00 00 00 C4");
  const temp = bytes("DF DF 03 00 06 01 03 17 03 14 01 FA");
  const result = bytes("DF DF 03 00 07 02 00 4F 00 02 09 3D 61");

  it("reads the official example result", () => {
    expect(parseDifluidTds(result)).toBe(0.79);
  });

  it("finds several frames in one notification", () => {
    const joined = new Uint8Array([...status, ...temp, ...result]);
    const { frames, rest } = splitFrames(joined);
    expect(frames.map(hex)).toEqual([hex(status), hex(temp), hex(result)]);
    expect(rest.length).toBe(0);
  });

  it("keeps half a frame until the rest arrives", () => {
    const a = splitFrames(result.slice(0, 8));
    expect(a.frames).toEqual([]);
    const b = splitFrames(new Uint8Array([...a.rest, ...result.slice(8)]));
    expect(b.frames.map(parseDifluidTds)).toEqual([0.79]);
  });

  it("drops noise before a header and ignores negative readings", () => {
    const { frames } = splitFrames(new Uint8Array([0x01, 0x02, ...result]));
    expect(frames.length).toBe(1);
    expect(parseDifluidTds(bytes("DF DF 03 01 07 03 FF F9 FF FF E4 44 EA"))).toBeNull(); // -0.07
  });
});
