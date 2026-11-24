import { describe, expect, it } from "vitest";
import { composeShotNote, parseShotNote } from "../shot-record";

describe("shot notes", () => {
  it("reads what the Station writes after tasting", () => {
    expect(parseShotNote("Sour · TDS 9.50% · EY 24.2% · chocolate, a bit sharp")).toEqual({
      taste: "sour", tds: 9.5, ey: 24.2, text: "chocolate, a bit sharp",
    });
  });

  it("reads partial notes", () => {
    expect(parseShotNote("Balanced")).toEqual({ taste: "balanced", text: "" });
    expect(parseShotNote("TDS 10.83% · EY 19.9%")).toEqual({ tds: 10.83, ey: 19.9, text: "" });
    expect(parseShotNote("just text")).toEqual({ text: "just text" });
    expect(parseShotNote(null)).toEqual({ text: "" });
  });

  it("a taste word inside the free text stays text", () => {
    expect(parseShotNote("nice · Sour")).toEqual({ text: "nice · Sour" });
  });

  it("writes back the same line", () => {
    const line = "Bitter · TDS 11.16% · EY 20.5% · dark chocolate";
    expect(composeShotNote(parseShotNote(line))).toBe(line);
    expect(composeShotNote({ text: " " })).toBe("");
    expect(composeShotNote({ tds: 9, text: "" })).toBe("TDS 9.00%");
  });
});
