import { afterEach, describe, expect, it, vi } from "vitest";
import { countUse, usageDay } from "../usage";

describe("usage counter", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("days in UTC", () => {
    expect(usageDay(new Date("2026-11-24T23:30:00-03:00"))).toBe("2026-11-25");
  });

  it("counts only on the published site, once a day", async () => {
    const store = new Map<string, string>();
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("window", { location: { hostname: "localhost", search: "" } });
    await countUse("d");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal("window", { location: { hostname: "not9bar.com", search: "" } });
    await countUse("d");
    await countUse("d");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://count.not9bar.com/hit/d");

    vi.stubGlobal("window", { location: { hostname: "not9bar.com", search: "?demo=rate" } });
    await countUse("s");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed count is tried again next time", async () => {
    const store = new Map<string, string>();
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 500 })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal("window", { location: { hostname: "not9bar.com", search: "" } });
    await countUse("s");
    await countUse("s");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
