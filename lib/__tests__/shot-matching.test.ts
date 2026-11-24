import { beforeEach, describe, expect, it, vi } from "vitest";
import { findNewShot, linkShot, logShotNotes, recordBrewGrind, shotNotes } from "../coffee-history";
import type { ShotEntry } from "../types";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const MIN = 60_000;
function shot(dbKey: number, timeMs: number, shortDescription?: string): ShotEntry {
  return {
    id: `s${dbKey}`, db_key: dbKey, time: timeMs / 1000, file: "", name: "Damian's LRv2", data: [],
    profile: { id: "p", name: "Damian's LRv2", display: shortDescription ? { shortDescription } : {} },
  } as unknown as ShotEntry;
}

describe("findNewShot", () => {
  const start = 100 * MIN;

  it("takes the shot saved after the start, not the one that was newest before", () => {
    const history = [shot(7, start - 5 * MIN), shot(8, start + 10_000)];
    expect(findNewShot(history, start, 7)?.db_key).toBe(8);
  });

  it("finds nothing while the machine is still saving", () => {
    expect(findNewShot([shot(7, start - 30_000)], start, 7)).toBeNull();
  });

  it("without the previous number, an older shot is still refused by time", () => {
    expect(findNewShot([shot(7, start - 5 * MIN)], start, null)).toBeNull();
    expect(findNewShot([shot(8, start + 1000), shot(7, start - 5 * MIN)], start, null)?.db_key).toBe(8);
  });
});

describe("coffee and grind by shot number", () => {
  beforeEach(() => store.clear());

  it("a load tied to a shot isn't reused for the next shot made within 30 min", () => {
    vi.useFakeTimers({ now: 100 * MIN });
    logShotNotes("Kenya AA", "Motto 80 140µm");
    recordBrewGrind("Motto 80 142µm");
    const first = shot(1, 105 * MIN);
    linkShot(first);
    expect(shotNotes(first)).toEqual({ coffee: "Kenya AA", grind: "Motto 80 142µm" });
    // A second shot started on the machine 10 min later, with no load from the Station
    const second = shot(2, 115 * MIN);
    linkShot(second);
    expect(shotNotes(second)).toEqual({});
    vi.useRealTimers();
  });

  it("doesn't tie a load to a shot whose own notes name another coffee", () => {
    vi.useFakeTimers({ now: 100 * MIN });
    logShotNotes("Kenya AA", "Motto 80 140µm");
    const other = shot(3, 101 * MIN, "Coffee: Brazil | Grind: Niche grind 2.5");
    linkShot(other);
    expect(shotNotes(other).coffee).toBe("Brazil");
    // The load is still free for its own shot
    const mine = shot(4, 102 * MIN);
    linkShot(mine);
    expect(shotNotes(mine).coffee).toBe("Kenya AA");
    vi.useRealTimers();
  });

  it("older records without a number still match by time", () => {
    vi.useFakeTimers({ now: 100 * MIN });
    logShotNotes("Etiopia", "Motto 80 150µm");
    expect(shotNotes(shot(5, 110 * MIN)).coffee).toBe("Etiopia");
    expect(shotNotes(shot(6, 140 * MIN)).coffee).toBeUndefined();
    vi.useRealTimers();
  });
});
