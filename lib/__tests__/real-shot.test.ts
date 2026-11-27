import { describe, expect, it } from "vitest";
import { realShot, REAL_SHOT_PROFILE } from "../real-shot";
import { stageLog } from "../stage-log";

describe("the home page's real shot", () => {
  it("logs which exit ended each stage", () => {
    const pts = realShot();
    const { events, live } = stageLog(pts, REAL_SHOT_PROFILE, false);
    console.log(events.map((e) => `${e.t.toFixed(1)} ${e.kind} ${e.text}`).join("\n"));
    expect(live).toBeNull();
    expect(events.filter((e) => e.kind === "stage").map((e) => e.text.split(" · ")[0]))
      .toEqual(["Fill start", "Fill", "Infuse", "Pressure Up", "Pressure Decline"]);
    // It ended on the profile's final weight (the last drops included)
    expect(events.at(-1)?.text).toContain("final weight 40 g");
    const mid = stageLog(pts.slice(0, 120), REAL_SHOT_PROFILE, true);
    expect(mid.live?.name).toBe("Pressure Decline");
  });
});
