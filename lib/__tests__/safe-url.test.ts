import { describe, expect, it } from "vitest";
import { machineImageUrl, safeColor } from "../safe-url";

describe("machineImageUrl", () => {
  it("keeps images on the machine", () => {
    expect(machineImageUrl("http://192.168.1.5", "/api/v1/profile/image/a.png")).toBe("http://192.168.1.5/api/v1/profile/image/a.png");
  });
  it("refuses paths that would point to another site", () => {
    expect(machineImageUrl("http://192.168.1.5", ".evil.example/p.png")).toBe("http://192.168.1.5/.evil.example/p.png");
    expect(machineImageUrl("http://192.168.1.5", "//evil.example/p.png")).toBeNull();
    expect(machineImageUrl("http://192.168.1.5", "@evil.example/p.png")).not.toContain("evil.example/p.png@");
  });
});

describe("safeColor", () => {
  it("accepts hex colors only", () => {
    expect(safeColor("#ffc400")).toBe("#ffc400");
    expect(safeColor("#000), url(https://evil/x), linear-gradient(#000")).toBeNull();
    expect(safeColor("red")).toBeNull();
  });
});
