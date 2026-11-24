import { describe, expect, it } from "vitest";
import { difluidFrame, parseDifluidTds, SINGLE_TEST } from "../difluid";

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
