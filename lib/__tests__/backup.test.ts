import { describe, expect, it } from "vitest";
import { backedUp, backupFileName, backupSummary, makeBackup, readBackup, restoreBackup, BACKUP_AT_KEY } from "../backup";

class MemStore {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const tablet = () => {
  const s = new MemStore();
  s.setItem("metbarista_recent_beans", JSON.stringify(["Bala de caramelo", "Melaco"]));
  s.setItem("metbarista_shot_log", JSON.stringify({ 1: {}, 2: {}, 3: {} }));
  s.setItem("metbarista_theme", "dark");
  s.setItem("metbarista_grinder_access_v2", "1");
  s.setItem("metbarista_difluid_access", "1");
  s.setItem(BACKUP_AT_KEY, "2026-11-01");
  s.setItem("other_site_key", "x");
  return s;
};

describe("backup", () => {
  it("keeps the Station's data, not Bluetooth permissions or other sites", () => {
    expect(backedUp("metbarista_recipe")).toBe(true);
    expect(backedUp("metbarista_grinder_access_v2")).toBe(false);
    expect(backedUp("metbarista_difluid_access")).toBe(false);
    expect(backedUp("other_site_key")).toBe(false);
    const b = makeBackup(tablet(), new Date("2026-11-24T10:00:00Z"));
    expect(Object.keys(b.data)).toEqual(["metbarista_recent_beans", "metbarista_shot_log", "metbarista_theme"]);
    expect(b.savedAt).toBe("2026-11-24T10:00:00.000Z");
  });

  it("round-trips through the file onto a new tablet", () => {
    const file = JSON.stringify(makeBackup(tablet()));
    const fresh = new MemStore();
    fresh.setItem("metbarista_recent_beans", JSON.stringify(["Old"]));
    fresh.setItem("metbarista_next_plans", "{}");
    fresh.setItem("metbarista_difluid_access", "1");
    restoreBackup(fresh, readBackup(file));
    expect(JSON.parse(fresh.getItem("metbarista_recent_beans")!)).toEqual(["Bala de caramelo", "Melaco"]);
    expect(fresh.getItem("metbarista_next_plans")).toBeNull(); // replaced, not merged
    expect(fresh.getItem("metbarista_difluid_access")).toBe("1"); // this browser's permission stays
  });

  it("refuses files that aren't a Station backup", () => {
    expect(() => readBackup("hello")).toThrow(/not JSON/);
    expect(() => readBackup(JSON.stringify({ app: "other", data: {} }))).toThrow(/isn't a Station backup/);
    expect(() => readBackup(JSON.stringify({ app: "metbarista-station", version: 99, data: {} }))).toThrow(/newer/);
  });

  it("ignores foreign keys smuggled into a file", () => {
    const b = readBackup(JSON.stringify({ app: "metbarista-station", version: 1, data: { evil: "x", metbarista_theme: "dark", metbarista_x_access: "1" } }));
    expect(Object.keys(b.data)).toEqual(["metbarista_theme"]);
  });

  it("describes what's inside", () => {
    expect(backupSummary(makeBackup(tablet()))).toBe("2 coffees · 3 shot records");
    expect(backupFileName(new Date(2026, 10, 4))).toBe("station-backup-2026-11-04.json");
  });
});

describe("backup with bag photos (version 2)", () => {
  const photo = { id: "p1", coffee: "kenya aa", dataUrl: "data:image/jpeg;base64,AAAA", at: 1 };

  it("keeps valid photos and drops anything else", () => {
    const b = readBackup(JSON.stringify({
      app: "metbarista-station", version: 2, data: {},
      photos: [photo, { id: "x", coffee: "y", dataUrl: "javascript:alert(1)", at: 2 }, null],
    }));
    expect(b.photos).toEqual([photo]);
    expect(backupSummary(b)).toBe("1 photo");
  });

  it("an older backup has no photos (this device keeps its own)", () => {
    expect(readBackup(JSON.stringify({ app: "metbarista-station", version: 1, data: {} })).photos).toBeUndefined();
  });
});
