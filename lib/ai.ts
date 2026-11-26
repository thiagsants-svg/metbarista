/**
 * AI shot review: the providers, their keys and one request each.
 *
 * The key is the user's own, pasted on this tablet, and goes straight from the
 * browser to the provider (no server in between). It is kept under a
 * "not9bar_" name, so a backup file never carries it. Only what the review
 * needs is sent: the shot's summary (see lib/ai-review.ts).
 *
 * The idea of a stage-by-stage AI review with the user's own key comes from
 * portal-met-bridge by privaterra (MIT); the code here is our own.
 */

export type Provider = "anthropic" | "openai" | "gemini" | "xai";

export interface ProviderInfo {
  name: string;
  /** A model that works today; the field can be changed */
  defaultModel: string;
  /** Where the user creates a key */
  keyUrl: string;
  /** What a key starts with, to catch a wrong paste (empty: no check) */
  keyPrefix: string;
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: { name: "Claude (Anthropic)", defaultModel: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys", keyPrefix: "sk-ant-" },
  openai: { name: "ChatGPT (OpenAI)", defaultModel: "gpt-4.1", keyUrl: "https://platform.openai.com/api-keys", keyPrefix: "sk-" },
  gemini: { name: "Gemini (Google)", defaultModel: "gemini-2.5-flash", keyUrl: "https://aistudio.google.com/apikey", keyPrefix: "" },
  xai: { name: "Grok (xAI)", defaultModel: "grok-4", keyUrl: "https://console.x.ai", keyPrefix: "xai-" },
};

/** The barista's setup, told once and sent with every review */
export interface AiSetup {
  /** The smallest grind change the grinder makes, µm (the Motto 80: 5) */
  grindStepUm?: number;
  water?: string;
  /** Puck preparation used */
  prep?: string[];
  drink?: "espresso" | "milk" | "both";
  /** Anything else about the setup */
  notes?: string;
}

export const PREP_OPTIONS: Record<string, string> = {
  wdt: "WDT (needles stirred through the grounds)",
  rdt: "RDT (a drop of water on the beans)",
  distribution: "a distribution tool",
  screen: "a puck screen on top",
  singleDose: "single-dose grinding (each dose weighed)",
  tamper: "a calibrated tamper",
};

export interface AiSettings {
  setup?: AiSetup;
  provider: Provider;
  /** Per provider; empty = its default */
  models: Partial<Record<Provider, string>>;
  /** The language the review is written in */
  language: "pt-BR" | "en";
}

const SETTINGS_KEY = "metbarista_ai_settings";
const keyName = (p: Provider) => `not9bar_ai_key_${p}`;

export function loadAiSettings(): AiSettings {
  const base: AiSettings = { provider: "anthropic", models: {}, language: "en" };
  if (typeof window === "undefined") return base;
  try { return { ...base, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AiSettings>) }; } catch { return base; }
}
export function saveAiSettings(s: AiSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* kept for this visit only */ }
}
export function getAiKey(p: Provider): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(keyName(p)) ?? "";
}
export function setAiKey(p: Provider, key: string): void {
  const k = key.trim();
  if (k) localStorage.setItem(keyName(p), k); else localStorage.removeItem(keyName(p));
}
export const modelOf = (s: AiSettings) => s.models[s.provider]?.trim() || PROVIDERS[s.provider].defaultModel;

/** A pasted key that doesn't look like this provider's (likely the wrong one) */
export function keyLooksWrong(p: Provider, key: string): boolean {
  const pre = PROVIDERS[p].keyPrefix;
  return !!key.trim() && !!pre && !key.trim().startsWith(pre);
}

/** The request for one answer (no streaming: a review is read once it's whole) */
export function buildRequest(p: Provider, { key, model, system, user, maxTokens = 4000 }: {
  key: string; model: string; system: string; user: string; maxTokens?: number;
}): { url: string; init: RequestInit } {
  const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    credentials: "omit", referrerPolicy: "no-referrer",
  });
  if (p === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      init: json(
        // The last header is Anthropic's switch for calls made straight from a page
        { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
      ),
    };
  }
  if (p === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: json({ "x-goog-api-key": key }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    };
  }
  // OpenAI and xAI speak the same chat format
  const base = p === "xai" ? "https://api.x.ai" : "https://api.openai.com";
  return {
    url: `${base}/v1/chat/completions`,
    init: json({ Authorization: `Bearer ${key}` }, {
      model, messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  };
}

/** The answer's text, from each provider's reply shape */
export function readAnswer(p: Provider, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (p === "anthropic") {
    const parts = (d.content as { type: string; text?: string }[] | undefined) ?? [];
    return parts.filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n").trim();
  }
  if (p === "gemini") {
    const c = (d.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0];
    return (c?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  }
  const choice = (d.choices as { message?: { content?: string } }[] | undefined)?.[0];
  return (choice?.message?.content ?? "").trim();
}

/** Asks the provider; throws a readable error (wrong key, no credit, model name…) */
export async function askAi(s: AiSettings, system: string, user: string): Promise<string> {
  const key = getAiKey(s.provider);
  if (!key) throw new Error(`No key for ${PROVIDERS[s.provider].name} yet: paste it in the AI settings.`);
  const { url, init } = buildRequest(s.provider, { key, model: modelOf(s), system, user });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new Error(`Couldn't reach ${PROVIDERS[s.provider].name}: ${e instanceof Error ? e.message : e}. Is the tablet online?`);
  }
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!res.ok) {
    const msg = (data?.error as { message?: string } | undefined)?.message ?? res.statusText;
    if (res.status === 401 || res.status === 403) throw new Error(`The key was refused (${res.status}): check it in the AI settings. ${msg}`);
    if (res.status === 404) throw new Error(`Model "${modelOf(s)}" not found: try the default in the AI settings. ${msg}`);
    if (res.status === 429) throw new Error(`Too many requests or no credit left (${res.status}). ${msg}`);
    throw new Error(`${PROVIDERS[s.provider].name} answered ${res.status}: ${msg}`);
  }
  const text = readAnswer(s.provider, data);
  if (!text) throw new Error("The answer came back empty.");
  return text;
}
