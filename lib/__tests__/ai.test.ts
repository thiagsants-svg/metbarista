import { describe, expect, it } from "vitest";
import { buildRequest, keyLooksWrong, readAnswer } from "../ai";
import { reviewPrompt, shotDigest, type ReviewShot } from "../ai-review";

describe("AI providers", () => {
  it("builds each provider's request", () => {
    const a = buildRequest("anthropic", { key: "sk-ant-x", model: "claude-sonnet-5-5", system: "S", user: "U" });
    expect(a.url).toBe("https://api.anthropic.com/v1/messages");
    const h = a.init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-ant-x");
    expect(h["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(JSON.parse(a.init.body as string)).toMatchObject({ model: "claude-sonnet-5-5", system: "S", messages: [{ role: "user", content: "U" }] });
    expect(buildRequest("xai", { key: "k", model: "m", system: "S", user: "U" }).url).toBe("https://api.x.ai/v1/chat/completions");
    const g = buildRequest("gemini", { key: "k", model: "gemini-2.5-flash", system: "S", user: "U" });
    expect(g.url).toContain("gemini-2.5-flash:generateContent");
    expect((g.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });
  it("reads each provider's answer", () => {
    expect(readAnswer("anthropic", { content: [{ type: "text", text: "## Verdict\nGood" }] })).toContain("Verdict");
    expect(readAnswer("openai", { choices: [{ message: { content: "ok" } }] })).toBe("ok");
    expect(readAnswer("gemini", { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] })).toBe("ab");
  });
  it("catches a key pasted for the wrong AI", () => {
    expect(keyLooksWrong("anthropic", "sk-proj-123")).toBe(true);
    expect(keyLooksWrong("anthropic", "sk-ant-api03-x")).toBe(false);
    expect(keyLooksWrong("gemini", "AIza...")).toBe(false);
  });
});

describe("review text", () => {
  const shot = { id: "a", time: 1764000000, name: "LRv2 - 18g 1:2.2 93C", db_key: 1, data: [], profile: { name: "LRv2", stages: [], variables: [] } } as unknown as ReviewShot["shot"];
  const cur: ReviewShot = {
    shot, face: "like",
    sum: { coffee: "Kenya", when: 1764000000000, profileName: "LRv2", patch: { dose: 18, ratio: 2.2, temperature: 93, grindUm: 140 }, weight: 39.6, seconds: 31, stars: null },
    notes: { taste: "sour", tds: 9.1, ey: 20, text: "bright" },
  };
  it("tells the recipe, result and verdict, and asks for the outline in Portuguese", () => {
    const d = shotDigest(cur);
    expect(d).toMatch(/dose 18 g · ratio 1:2.2 · temperature 93 °C · grind 140 µm/);
    expect(d).toMatch(/39.6 g in the cup \(1:2.20\) in 0:31/);
    expect(d).toMatch(/TDS 9.1%, EY 20%/);
    expect(d).toMatch(/liked it/);
    const p = reviewPrompt(cur, [], "pt-BR");
    expect(p.system).toMatch(/## Veredito/);
    expect(p.user).toMatch(/Review this shot/);
  });
});

import { dataGaps, seriesTable, setupText, traceForAi } from "../ai-review";

describe("review extras", () => {
  const base = (when: number, grindUm: number, tds?: number): ReviewShot => ({
    shot: { id: String(when), time: when / 1000, name: "x", db_key: 1, data: [], profile: undefined } as unknown as ReviewShot["shot"],
    sum: { coffee: "Kenya", when, profileName: "LRv2", patch: { dose: 18, ratio: 2, temperature: 93, grindUm }, weight: 36, seconds: 30, stars: null },
    notes: { text: "", ...(tds != null ? { tds, ey: 20 } : {}) },
  });
  it("lists what is missing", () => {
    const g = dataGaps(base(1764000000000, 140));
    expect(g.join("; ")).toMatch(/no refractometer reading/);
    expect(g.join("; ")).toMatch(/no verdict/);
    expect(g.join("; ")).not.toMatch(/grind not recorded/);
  });
  it("puts the coffee's shots side by side", () => {
    const t = seriesTable([base(1764000000000, 145), base(1764003600000, 140, 9)]);
    expect(t.split("\n")).toHaveLength(4);
    expect(t).toMatch(/145 µm .* 36 \| 1:2.00 \| \? \| 0:30 \| - /);
    expect(t).toMatch(/140 µm .* \| 9 \| 20 \|/);
  });
  it("tells the setup and samples the curve once a second", () => {
    expect(setupText({ grindStepUm: 5, prep: ["wdt"], drink: "espresso" })).toMatch(/steps of 5 µm.*WDT.*straight espresso/);
    const frames = Array.from({ length: 50 }, (_, i) => ({ time: i * 200, shot: { pressure: 9, flow: 2, weight: i / 5, gravimetric_flow: 1 } }));
    const tr = traceForAi(frames as never)!;
    expect(tr.split("\n")).toHaveLength(11);
  });
});
