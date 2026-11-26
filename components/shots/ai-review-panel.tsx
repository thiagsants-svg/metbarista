"use client";

/**
 * The AI review of a shot, on its page: one tap asks the chosen AI (your own
 * key, from this tablet), the answer is kept with the shot. The settings sit
 * here too: which AI, its key (kept only on this tablet, never in a backup),
 * the model and the language.
 */

import { Fragment, useState, type ReactNode } from "react";
import { Bot, ChevronDown, Loader2, Settings } from "lucide-react";
import {
  askAi, getAiKey, keyLooksWrong, loadAiSettings, modelOf, PREP_OPTIONS, PROVIDERS, saveAiSettings, setAiKey,
  type AiSettings, type Provider,
} from "@/lib/ai";
import { loadReview, reviewPrompt, saveReview, type ReviewShot, type SavedReview } from "@/lib/ai-review";
import { dayYear } from "@/lib/format-date";

/** Bold (**x**) inside a line, as React text (nothing from the answer becomes HTML) */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>);
}

/** The few Markdown shapes a review uses: headings, bullets, numbered items, paragraphs */
export function ReviewText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={`mt-1 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
      {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
    </Tag>);
    list = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    const n = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(<h3 key={out.length} className="mt-3 text-sm font-bold uppercase tracking-wider text-[var(--ink)]/80">{inline(h[1])}</h3>); }
    else if (b || n) {
      const ordered = !!n;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((b ?? n)![1]);
    } else if (line.trim()) { flush(); out.push(<p key={out.length} className="mt-1">{inline(line)}</p>); }
    else flush();
  }
  flush();
  return <div className="text-sm leading-relaxed text-[var(--ink)]/90">{out}</div>;
}

export function AiReviewPanel({ current, previous }: {
  current: ReviewShot;
  /** Earlier shots of the same coffee, newest first */
  previous: ReviewShot[];
}) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [saved, setSaved] = useState<SavedReview | null>(() => loadReview(current.shot.time));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(() => !!getAiKey(settings.provider));
  const [open, setOpen] = useState(() => !getAiKey(loadAiSettings().provider));
  const [keyInput, setKeyInput] = useState("");
  /** A question for this review ("why sour?"), optional */
  const [question, setQuestion] = useState("");
  const setup = settings.setup ?? {};
  const setSetup = (patch: Partial<NonNullable<AiSettings["setup"]>>) => update({ ...settings, setup: { ...setup, ...patch } });
  const info = PROVIDERS[settings.provider];

  function update(next: AiSettings) {
    setSettings(next);
    saveAiSettings(next);
    setHasKey(!!getAiKey(next.provider));
  }

  async function review() {
    setBusy(true);
    setError(null);
    try {
      const { system, user } = reviewPrompt(current, previous.slice(0, 5), settings.language, { setup: settings.setup, question });
      const text = await askAi(settings, system, user);
      const r: SavedReview = { at: Date.now(), provider: info.name, model: modelOf(settings), text };
      saveReview(current.shot.time, r);
      setSaved(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const field = "h-11 w-full rounded-md border border-[var(--ink)]/20 bg-transparent px-3 text-base text-[var(--ink)]";
  const keyWrong = keyLooksWrong(settings.provider, keyInput);

  return (
    <section className="rounded-md border border-[var(--ink)]/15 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">
          <Bot className="mr-1.5 inline h-4 w-4 align-[-2px]" />AI review
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="flex h-10 items-center gap-1.5 rounded-md border border-[var(--ink)]/20 px-3 text-sm font-semibold text-[var(--ink)]/80">
          <Settings className="h-4 w-4" /> AI settings <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 rounded-md bg-[var(--ink)]/[0.04] p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">AI</span>
            <select value={settings.provider} onChange={(e) => update({ ...settings, provider: e.target.value as Provider })} className={field}>
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Language</span>
            <select value={settings.language} onChange={(e) => update({ ...settings, language: e.target.value as AiSettings["language"] })} className={field}>
              <option value="en">English</option>
              <option value="pt-BR">Português</option>
            </select>
          </label>
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">
              Key {hasKey ? <span className="normal-case tracking-normal text-[var(--good)]">· saved on this tablet</span> : null}
            </span>
            <div className="flex gap-2">
              <input type="password" autoComplete="off" value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                placeholder={hasKey ? "Paste a new key to replace it" : `Paste your ${info.name} key${info.keyPrefix ? ` (${info.keyPrefix}…)` : ""}`}
                aria-label="API key" className={`${field} min-w-0 flex-1`} />
              <button type="button" disabled={!keyInput.trim()}
                onClick={() => { setAiKey(settings.provider, keyInput); setKeyInput(""); setHasKey(true); }}
                className="h-11 shrink-0 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] disabled:opacity-40">Save key</button>
              {hasKey && (
                <button type="button" onClick={() => { setAiKey(settings.provider, ""); setHasKey(false); }}
                  className="h-11 shrink-0 rounded-md border border-[var(--ink)]/25 px-3 text-sm font-semibold">Remove</button>
              )}
            </div>
            {keyWrong && <p className="text-xs font-semibold text-[var(--accent)]">That doesn&apos;t look like a {info.name} key (it should start with {info.keyPrefix}).</p>}
            <p className="text-xs text-[var(--ink)]/65">
              Kept only on this tablet, never in a backup, and sent only to {info.name}.{" "}
              <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Get a key</a>
              {" "}· each review costs a few cents on your account there.
            </p>
          </div>
          {/* The setup, told once: sent with every review */}
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70 sm:col-span-2">Your setup (sent with every review)</p>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-[var(--ink)]/70">Grinder step (µm)</span>
            <input type="number" inputMode="decimal" value={setup.grindStepUm ?? ""} placeholder="5 on the Motto 80"
              onChange={(e) => setSetup({ grindStepUm: e.target.value === "" ? undefined : Number(e.target.value) })} className={field} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-[var(--ink)]/70">I drink it</span>
            <select value={setup.drink ?? ""} onChange={(e) => setSetup({ drink: (e.target.value || undefined) as NonNullable<AiSettings["setup"]>["drink"] })} className={field}>
              <option value="">—</option>
              <option value="espresso">Straight</option>
              <option value="milk">With milk</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-xs text-[var(--ink)]/70">Water</span>
            <input value={setup.water ?? ""} placeholder="e.g. filtered tap, Third Wave Water, mineral water brand"
              onChange={(e) => setSetup({ water: e.target.value })} className={field} />
          </label>
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-xs text-[var(--ink)]/70">Puck preparation</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PREP_OPTIONS).map(([k, label]) => {
                const on = setup.prep?.includes(k) ?? false;
                return (
                  <button key={k} type="button" aria-pressed={on}
                    onClick={() => setSetup({ prep: on ? (setup.prep ?? []).filter((x) => x !== k) : [...(setup.prep ?? []), k] })}
                    className={`h-10 rounded-full border px-3 text-sm ${on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`}>
                    {label.split(" (")[0]}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-xs text-[var(--ink)]/70">Anything else about your setup</span>
            <textarea rows={2} value={setup.notes ?? ""} onChange={(e) => setSetup({ notes: e.target.value })}
              className="w-full resize-none rounded-md border border-[var(--ink)]/20 bg-transparent px-3 py-2 text-base" />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Model</span>
            <input value={settings.models[settings.provider] ?? ""} placeholder={info.defaultModel}
              onChange={(e) => update({ ...settings, models: { ...settings.models, [settings.provider]: e.target.value } })} className={field} />
          </label>
        </div>
      )}

      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="A question for this review (optional): why sour? what to change first?"
        aria-label="Question for the review" className={`${field} mt-3`} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={review} disabled={busy || !hasKey}
          className="flex h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-5 text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
          {busy ? `Asking ${info.name.split(" ")[0]}…` : saved ? "Review again" : `Review with ${info.name.split(" ")[0]}`}
        </button>
        <p className="text-xs text-[var(--ink)]/65">
          {busy ? "Usually 20–60 seconds." : !hasKey ? "Paste a key in AI settings first." : `Sends this shot's numbers, curve, profile and notes${previous.length ? `, and ${Math.min(5, previous.length)} earlier shot${previous.length > 1 ? "s" : ""} of this coffee side by side` : ""}.`}
        </p>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-[var(--accent)]">{error}</p>}

      {saved && (
        <div className="mt-3 border-t border-[var(--ink)]/15 pt-2">
          <p className="text-xs text-[var(--ink)]/60">{saved.provider} · {saved.model} · {dayYear(saved.at)}</p>
          <ReviewText text={saved.text} />
          <p className="mt-2 text-xs text-[var(--ink)]/55">A reading of the numbers by an AI: try one change at a time, and trust your taste.</p>
        </div>
      )}
    </section>
  );
}
