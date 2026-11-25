import { describe, expect, it } from "vitest";
import { addressesInOrder, rangeOf, rangesFor } from "../find-machine";

describe("find machine ranges", () => {
  it("starts from the last known IP's range", () => {
    expect(rangeOf("192.168.1.42")).toBe("192.168.1");
    expect(rangesFor("10.1.2.3")[0]).toBe("10.1.2");
    expect(rangesFor("192.168.0.9").filter((r) => r === "192.168.0")).toHaveLength(1);
  });
  it("falls back to the usual home ranges", () => {
    expect(rangeOf("not-an-ip")).toBeNull();
    expect(rangesFor(null)[0]).toBe("192.168.1");
  });
  it("tries the likeliest addresses first, every address once", () => {
    const a = addressesInOrder("192.168.1", "192.168.1.42");
    expect(a.slice(0, 3)).toEqual(["192.168.1.42", "192.168.1.43", "192.168.1.41"]);
    expect(new Set(a).size).toBe(254);
    expect(a.at(-1)).toBe("192.168.1.1");
    expect(addressesInOrder("10.0.0")[0]).toBe("10.0.0.2");
  });
});
