import { describe, expect, it } from "vitest";
import { buildNumber, newestFromRefs } from "../firmware";

describe("firmware versions", () => {
  it("reads the build number", () => {
    expect(buildNumber("2026M1556-stable")).toBe(1556);
    expect(buildNumber("v1.107.0")).toBeNull();
  });
  it("picks the newest tag of a channel by build number, not by text order", () => {
    expect(newestFromRefs(["refs/tags/beta/2026M1504-beta", "refs/tags/beta/2026M1547-beta", "refs/tags/beta/2026M999-beta"])).toBe("2026M1547-beta");
    expect(newestFromRefs([])).toBeNull();
  });
});
