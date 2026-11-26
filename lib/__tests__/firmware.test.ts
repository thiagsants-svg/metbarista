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

import { parseChangelog } from "../firmware";

describe("build changelog", () => {
  it("keeps features and fixes per component, without merges or tests", () => {
    const yaml = [
      'channel: "stable"', 'timestamp: "2026-11-17T22-56-00"', 'build-version: "2026M1556-stable"',
      "versions:", '  backend: "592aae5"', "changes:",
      "  backend:", '    old_rev: "a"', "    commits:",
      '      - hash: "1"', '        message: "fix(config): write settings and profiles atomically"',
      '      - hash: "2"', '        message: "Merge pull request #1 from x"',
      '      - hash: "3"', '        message: "test(wifi): make the test fail"',
      "  dial:", "    commits:",
      '      - hash: "4"', '        message: "feat: predict the final weight"',
      "  linux:", "    commits:",
      '      - hash: "5"', '        message: "docs: readme"',
    ].join("\n");
    const log = parseChangelog(yaml);
    expect(log.version).toBe("2026M1556-stable");
    expect(log.date).toBe("2026-11-17");
    expect(log.groups.map((g) => g.component)).toEqual(["backend", "dial"]);
    expect(log.groups[0].items[0]).toEqual({ kind: "fix", scope: "config", text: "write settings and profiles atomically" });
  });
});
