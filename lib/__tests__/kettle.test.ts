import { describe, expect, it } from "vitest";
import { parseCliState, parseTempJson, validKettleHost } from "../kettle";

describe("kettle readings", () => {
  it("reads /temp JSON, with nan when lifted", () => {
    expect(parseTempJson('{"temp": 92.5, "temp_set": 96, "state": "heating"}')).toMatchObject({ temp: 92.5, target: 96, state: "heating" });
    expect(parseTempJson('{"temp": nan, "temp_set": 96}')?.temp).toBeNull();
    expect(parseTempJson("<html>")).toBeNull();
  });
  it("reads the older cli state", () => {
    expect(parseCliState("mode=S_Heat tempr=88.4 temprT=96 temprB=90")).toMatchObject({ temp: 88.4, target: 96, state: "S_Heat" });
  });
  it("accepts only a local address", () => {
    expect(validKettleHost("192.168.1.20")).toBe(true);
    expect(validKettleHost("evil.com/x")).toBe(false);
    expect(validKettleHost("8.8.8.8")).toBe(false);
    expect(validKettleHost("999.1.1.1")).toBe(false);
    expect(validKettleHost("10.0.0.7")).toBe(true);
  });
});
