import { describe, expect, it } from "vitest";
import { profileTips } from "../profile-tip";

describe("profile tips", () => {
  it("keeps the sentences that say how to dial it in", () => {
    const d = "Aims to replicate lever machines. Opening the valve starts a quick pre-infusion. \n\n"
      + "Dial in a flow rate of 1.2 to 1.8 ml/s during extraction. Based on work by Damian https://example.com";
    expect(profileTips(d)).toEqual(["Dial in a flow rate of 1.2 to 1.8 ml/s during extraction."]);
  });

  it("reads the author's aims and warnings", () => {
    const d = "Aims:  shoot for a peak of 1 to 5 bar.  If you go over, you've ground too finely.  Intended for light roasts.";
    expect(profileTips(d)).toEqual(["Aims: shoot for a peak of 1 to 5 bar.", "If you go over, you've ground too finely."]);
  });

  it("nothing when there's no tip", () => {
    expect(profileTips("")).toEqual([]);
    expect(profileTips("Imported from the Decent Visualizer.\n\nDownloaded from Visualizer")).toEqual([]);
  });
});
