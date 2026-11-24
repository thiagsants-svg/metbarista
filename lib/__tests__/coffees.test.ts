import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeBeans, getCoffee, listCoffees, saveCoffee, setCoffeeStatus } from "../coffees";
import { rememberBeans } from "../recipe";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

describe("coffee shelf", () => {
  beforeEach(() => store.clear());

  it("brewed coffees appear by themselves, in brewing order", () => {
    rememberBeans("Kenya AA");
    rememberBeans("Etiópia Guji");
    expect(listCoffees().map((c) => c.name)).toEqual(["Etiópia Guji", "Kenya AA"]);
    expect(listCoffees()[0].status).toBe("open");
  });

  it("a coffee added here but never brewed comes after the brewed ones", () => {
    rememberBeans("Kenya AA");
    saveCoffee({ name: "Brazil Cerrado", roaster: "Moka", status: "frozen" });
    expect(listCoffees().map((c) => c.name)).toEqual(["Kenya AA", "Brazil Cerrado"]);
    expect(getCoffee("brazil cerrado")).toMatchObject({ roaster: "Moka", status: "frozen" });
  });

  it("details stick to the brewed coffee, matching accents and case", () => {
    rememberBeans("Etiópia Guji");
    saveCoffee({ name: "etiopia guji", notes: "washed" });
    const c = listCoffees();
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ name: "Etiópia Guji", notes: "washed" });
  });

  it("finished coffees leave the Station's list, frozen ones stay", () => {
    rememberBeans("Kenya AA");
    rememberBeans("Colombia");
    setCoffeeStatus("Kenya AA", "finished");
    saveCoffee({ name: "Frozen one", status: "frozen" });
    expect(activeBeans()).toEqual(["Colombia", "Frozen one"]);
    setCoffeeStatus("Kenya AA", "open");
    expect(activeBeans()).toContain("Kenya AA");
  });

  it("refuses an empty name; clears a detail set to blank", () => {
    expect(() => saveCoffee({ name: "  " })).toThrow();
    saveCoffee({ name: "X", roaster: "R" });
    saveCoffee({ name: "X", roaster: " " });
    expect(getCoffee("X")?.roaster).toBeUndefined();
  });
});

describe("freezer", () => {
  beforeEach(() => store.clear());

  it("single doses stay on the Station's list and count down per shot", async () => {
    const { takeDose } = await import("../coffees");
    saveCoffee({ name: "Kenya AA", status: "frozen", freezeMode: "doses", doses: 2 });
    expect(activeBeans()).toContain("Kenya AA");
    expect(getCoffee("Kenya AA")?.frozenAt).toBeGreaterThan(0);
    expect(takeDose("kenya aa")).toBe(1);
    expect(takeDose("Kenya AA")).toBe(0);
    expect(takeDose("Kenya AA")).toBe(0); // never below zero
    expect(takeDose("Other")).toBeNull();
  });

  it("a whole frozen bag leaves the list until it's thawed", async () => {
    const { thawCoffee } = await import("../coffees");
    rememberBeans("Brazil");
    saveCoffee({ name: "Brazil", status: "frozen", freezeMode: "bag" });
    expect(activeBeans()).not.toContain("Brazil");
    thawCoffee("Brazil");
    expect(activeBeans()).toContain("Brazil");
    expect(getCoffee("Brazil")).toMatchObject({ status: "open" });
    expect(getCoffee("Brazil")?.thawedAt).toBeGreaterThan(0);
  });

  it("an open coffee isn't counted in doses", async () => {
    const { takeDose } = await import("../coffees");
    saveCoffee({ name: "Open one", doses: 5 });
    expect(takeDose("Open one")).toBeNull();
  });

  it("days ago", async () => {
    const { daysAgo } = await import("../coffees");
    const now = Date.UTC(2026, 10, 24, 12);
    expect(daysAgo(now - 3_600_000, now)).toBe("today");
    expect(daysAgo(now - 86_400_000, now)).toBe("yesterday");
    expect(daysAgo(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });
});
