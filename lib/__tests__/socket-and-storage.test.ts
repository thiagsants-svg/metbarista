import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal("window", globalThis);

const { parsePackets } = await import("../machine-socket");
const { clearPlan, loadPlan, savePlan } = await import("../next-plan");
const { getShotNote, getShotPlan, saveShotNote, saveShotPlan } = await import("../shot-notes");

describe("socket packets (socket.io polling)", () => {
  it("splits several events and flags a ping to answer", () => {
    const raw = ['42["status",{"name":"idle"}]', "2", '42["sensors",{"t_tube":90}]'].join("\x1e");
    const r = parsePackets(raw);
    expect(r.events.map((e) => e[0])).toEqual(["status", "sensors"]);
    expect(r.ping).toBe(true);
    expect(r.sessionGone).toBe(false);
  });
  it("sees a dead session (new open packet, close, disconnect)", () => {
    for (const pkt of ['0{"sid":"x"}', "1", "41"]) expect(parsePackets(pkt).sessionGone, pkt).toBe(true);
  });
  it("skips malformed and unknown packets", () => {
    const r = parsePackets(["42[not json", "40", '42["only-name"]'].join("\x1e"));
    expect(r.events).toEqual([]);
    expect(r.ping).toBe(false);
  });
});

describe("next-shot plan storage", () => {
  beforeEach(() => store.clear());
  it("finds the plan whatever the accents or case, and clears it", () => {
    savePlan({ coffee: "Etiópia Guji", taste: "sour", at: 1 });
    expect(loadPlan(" etiopia guji ")?.taste).toBe("sour");
    clearPlan("ETIOPIA GUJI");
    expect(loadPlan("Etiópia Guji")).toBeNull();
  });
  it("survives a broken record", () => {
    store.set("metbarista_next_plans", "{not json");
    expect(loadPlan("Kenya")).toBeNull();
  });
});

describe("shot notes storage", () => {
  beforeEach(() => store.clear());
  it("keeps the note and the plan side by side on a shot", () => {
    saveShotNote(1700000000, 0, "chocolate");
    saveShotPlan(1700000000, { taste: "bitter" });
    expect(getShotNote(1700000000)?.note).toBe("chocolate");
    expect(getShotPlan(1700000000)?.taste).toBe("bitter");
  });
});
