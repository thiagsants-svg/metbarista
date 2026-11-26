/**
 * What an AI review reads: the shot told as plain text (recipe, what came out,
 * stage by stage from the machine's own samples, what the curves show, your
 * notes), with the coffee's previous shots for context, and the outline the
 * answer must follow. Only numbers and your own words; no photos, no names
 * beyond the coffee's.
 */

import type { ShotEntry } from "./types";
import type { CoffeeLastShot } from "./coffee-history";
import type { ShotNoteParts } from "./shot-record";
import type { NextPlan } from "./next-plan";
import { stageSummary, endText } from "./stage-summary";
import { shotFacts, FACT_LABEL } from "./shot-facts";
import { compassText } from "./taste-compass";
import { formatRatio } from "./recipe";
import type { TdsEstimate } from "./tds-estimate";
import type { AiSetup } from "./ai";
import { PREP_OPTIONS } from "./ai";
import type { Profile, ShotFrame } from "./types";

export interface ReviewShot {
  shot: ShotEntry;
  sum: CoffeeLastShot;
  notes: ShotNoteParts;
  face?: "like" | "dislike" | null;
  plan?: Pick<NextPlan, "taste" | "temperature" | "ratio" | "grind" | "grindWas"> | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** One shot as text */
export function shotDigest(x: ReviewShot, opts: { stages?: boolean; tdsEstimate?: TdsEstimate | null } = {}): string {
  const { shot, sum, notes } = x;
  const p = sum.patch;
  const lines: string[] = [];
  const when = new Date(sum.when).toISOString().slice(0, 16).replace("T", " ");
  lines.push(`Shot ${when} · coffee: ${sum.coffee || "not set"} · profile: ${sum.profileName || shot.profile?.name || "?"}`);
  const grind = p.grindUm != null ? `${p.grindUm} µm${p.grinder ? ` (${p.grinder})` : ""}` : p.grindSetting != null ? `setting ${p.grindSetting}${p.grinder ? ` (${p.grinder})` : ""}` : "not recorded";
  lines.push(`Recipe: dose ${p.dose ?? "?"} g · ratio ${p.ratio != null ? formatRatio(p.ratio) : "?"} · temperature ${p.temperature ?? "?"} °C · grind ${grind}`);
  const actual = p.dose ? ` (1:${(sum.weight / p.dose).toFixed(2)})` : "";
  lines.push(`Result: ${r1(sum.weight)} g in the cup${actual} in ${clock(sum.seconds)}`);
  if (notes.tds != null) lines.push(`Refractometer: TDS ${notes.tds}%${notes.ey != null ? `, EY ${notes.ey}%` : ""}`);
  // Only a real reading goes to the AI: the on-screen estimate is our own idea, not a recognised measure
  const verdict = [x.face === "like" ? "liked it" : x.face === "dislike" ? "didn't like it" : null, compassText(notes.taste, notes.body) || null]
    .filter(Boolean).join(" · ");
  if (verdict) lines.push(`Barista's verdict: ${verdict}`);
  if (notes.text) lines.push(`Barista's notes: ${notes.text}`);
  if (x.plan) {
    const parts = [x.plan.temperature != null ? `temperature ${x.plan.temperature} °C` : null, x.plan.ratio != null ? `ratio ${formatRatio(x.plan.ratio)}` : null,
      x.plan.grind ? `grind ${x.plan.grind}${x.plan.grindWas ? ` than ${x.plan.grindWas}` : ""}` : null].filter(Boolean);
    lines.push(`Planned for the next shot: ${parts.length ? parts.join(", ") : "same recipe"}`);
  }
  if (opts.stages !== false && shot.data?.length) {
    const st = stageSummary(shot.data, shot.profile);
    if (st.stages.length) {
      lines.push("Stages (from the machine's samples):");
      for (const s of st.stages) {
        lines.push(`- ${s.name}${s.type ? ` [${s.type}]` : ""}: ${r1(s.start / 1000)}–${r1(s.end / 1000)} s, ${r1(s.grams)} g into the cup, pressure avg ${r1(s.avgP)} / max ${r1(s.maxP)} bar, flow avg ${r1(s.avgF)} / max ${r1(s.maxF)} ml/s${s.onLimit > 0.1 ? `, on its limit ${Math.round(s.onLimit * 100)}% of the time` : ""} · ${endText(s.ended)}`);
      }
      if (st.preinfusion) lines.push(`Pre-infusion: ${r1(st.preinfusion.seconds)} s (${Math.round(st.preinfusion.share * 100)}% of the shot), ${r1(st.preinfusion.grams)} g in the cup`);
    }
    const facts = shotFacts(shot.data, shot.profile?.stages ?? []);
    lines.push(facts.length
      ? `What the curves show: ${facts.map((f) => `${FACT_LABEL[f.kind]} at ${r1(f.at / 1000)} s${f.stage ? ` (${f.stage})` : ""}: ${f.detail}`).join("; ")}`
      : "What the curves show: nothing unusual (no channeling, choking or limits hit).");
  }
  const vars = (shot.profile?.variables ?? []).filter((v) => typeof v.value === "number" && v.name);
  if (vars.length) lines.push(`Profile variables: ${vars.map((v) => `${v.name} = ${v.value}`).join(", ")}`);
  return lines.join("\n");
}

/** The profile as the machine ran it: every stage with its targets, limits and exit triggers (no pictures) */
export function profileForAi(profile: Profile | undefined): string | null {
  if (!profile?.stages?.length) return null;
  return JSON.stringify({
    name: profile.name, temperature: profile.temperature, final_weight: profile.final_weight,
    variables: (profile.variables ?? []).map((v) => ({ name: v.name, key: v.key, value: v.value })),
    stages: profile.stages.map((st) => ({
      name: st.name, type: st.type, dynamics: st.dynamics, limits: st.limits ?? [], exit_triggers: st.exit_triggers,
    })),
  });
}

/** The curve at one row a second: t s, pressure bar, flow ml/s, cup g, cup flow g/s */
export function traceForAi(frames: ShotFrame[]): string | null {
  if (frames.length < 5) return null;
  const rows: (number | null)[][] = [];
  let next = 0;
  for (const f of frames) {
    if (f.time / 1000 < next) continue;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
    rows.push([Math.round(f.time / 1000), n(f.shot?.pressure), n(f.shot?.flow), n(f.shot?.weight), n(f.shot?.gravimetric_flow)]);
    next = Math.floor(f.time / 1000) + 1;
  }
  return `columns: t_s, pressure_bar, flow_ml_s, cup_g, cup_flow_g_s\n${rows.map((r) => r.join(",")).join("\n")}`;
}

/** What's missing, so the AI says "can't tell" instead of guessing */
export function dataGaps(x: ReviewShot): string[] {
  const g: string[] = [];
  const p = x.sum.patch;
  if (p.grindUm == null && p.grindSetting == null) g.push("grind not recorded");
  if (!(x.sum.weight > 0)) g.push("no cup weight (the scale read nothing)");
  if (x.notes.tds == null) g.push("no refractometer reading (TDS / EY unknown)");
  if (!x.face && !x.notes.taste && !x.notes.text) g.push("no verdict from the barista (taste unknown)");
  if (x.sum.seconds > 0 && x.sum.seconds < 15) g.push(`very short shot (${Math.round(x.sum.seconds)} s): maybe a flush or stopped`);
  if ((x.shot.data?.length ?? 0) < 20) g.push("few samples recorded");
  if (!x.shot.profile?.stages?.length) g.push("the machine's record of the profile is missing");
  return g;
}

/** The coffee's shots side by side, oldest first: what changed and what came out */
export function seriesTable(shots: ReviewShot[]): string {
  const head = "| when | grind | dose g | temp °C | ratio set | cup g | ratio out | time | TDS % | EY % | verdict |";
  const rows = shots.map((x) => {
    const p = x.sum.patch;
    const when = new Date(x.sum.when).toISOString().slice(5, 16).replace("T", " ");
    const grind = p.grindUm != null ? `${p.grindUm} µm` : p.grindSetting != null ? String(p.grindSetting) : "?";
    const out = p.dose ? `1:${(x.sum.weight / p.dose).toFixed(2)}` : "?";
    const verdict = [x.face === "like" ? "liked" : x.face === "dislike" ? "disliked" : "", compassText(x.notes.taste, x.notes.body)].filter(Boolean).join(", ") || "-";
    return `| ${when} | ${grind} | ${p.dose ?? "?"} | ${p.temperature ?? "?"} | ${p.ratio != null ? formatRatio(p.ratio) : "?"} | ${r1(x.sum.weight)} | ${out} | ${clock(x.sum.seconds)} | ${x.notes.tds ?? "-"} | ${x.notes.ey ?? "-"} | ${verdict} |`;
  });
  return [head, "|" + " --- |".repeat(11), ...rows].join("\n");
}

/** The setup, as sentences */
export function setupText(setup: AiSetup | undefined): string | null {
  if (!setup) return null;
  const s: string[] = [];
  if (setup.grindStepUm) s.push(`The grinder changes in steps of ${setup.grindStepUm} µm: grind suggestions must be whole steps.`);
  if (setup.water?.trim()) s.push(`Water: ${setup.water.trim()}.`);
  if (setup.prep?.length) s.push(`Puck preparation: ${setup.prep.map((k) => PREP_OPTIONS[k] ?? k).join(", ")}.`);
  if (setup.drink) s.push(`The barista drinks it ${setup.drink === "espresso" ? "as a straight espresso" : setup.drink === "milk" ? "with milk" : "sometimes straight, sometimes with milk"}.`);
  if (setup.notes?.trim()) s.push(`Other notes: ${setup.notes.trim()}`);
  return s.length ? s.join(" ") : null;
}

const OUTLINE = {
  "pt-BR": `Escreva em português do Brasil, simples e direto, em Markdown, com exatamente estas seções:
## Veredito
Uma ou duas frases: o shot está bom? O que mais pesa?
## Etapa por etapa
Para cada etapa: o que aconteceu, e se funcionou bem, aceitável ou precisa de ajuste.
## O que chama atenção
Os pontos que importam, com os números.
## Mudanças sugeridas
Uma mudança por vez, na ordem de testar, dizendo o valor (moagem, temperatura, ratio, dose ou variável do perfil).
## Dúvidas em aberto
O que só o barista pode responder (gosto, aparência do puck).`,
  en: `Write in plain English, in Markdown, with exactly these sections:
## Verdict
One or two sentences: is the shot good? What matters most?
## Stage by stage
For each stage: what happened, and whether it worked well, was acceptable or needs work.
## What stands out
The points that matter, with the numbers.
## Suggested changes
One change at a time, in the order to try them, with the value (grind, temperature, ratio, dose or a profile variable).
## Open questions
What only the barista can answer (taste, how the puck looked).`,
};

export function reviewPrompt(
  current: ReviewShot, previous: ReviewShot[], language: "pt-BR" | "en",
  opts: { setup?: AiSetup; question?: string } = {},
): { system: string; user: string } {
  const system = `You are an experienced espresso coach reviewing a shot pulled on a Meticulous espresso machine (a lever-style machine: a motor-driven piston, profiles of stages controlled by pressure or flow, each stage ending on triggers like time, weight or pressure). Read the numbers carefully, never invent data that isn't given, and say when something can't be known from the numbers (the "Data gaps" list says what is missing). Taste beats numbers: when the barista's verdict and the numbers disagree, trust the verdict and explain. The machine runs as its maker designed: suggest only changes the barista can make (grind, dose, ratio, temperature, profile choice or its variables).

${OUTLINE[language]}`;
  const parts: string[] = ["Review this shot."];
  const setup = setupText(opts.setup);
  if (setup) parts.push(`About the barista's setup: ${setup}`);
  if (opts.question?.trim()) parts.push(`What the barista wants to know: ${opts.question.trim()}`);
  parts.push(`## This shot\n${shotDigest(current)}`);
  const gaps = dataGaps(current);
  parts.push(`Data gaps: ${gaps.length ? gaps.join("; ") : "none"}`);
  const profile = profileForAi(current.shot.profile);
  parts.push(profile ? `## The profile as the machine ran it (JSON)\n${profile}` : "## The profile\nNot recorded with the shot.");
  const trace = traceForAi(current.shot.data ?? []);
  if (trace) parts.push(`## The curve, one row a second\n${trace}`);
  if (previous.length) {
    parts.push(`## This coffee's shots side by side (oldest first; the last row is this shot)\n${seriesTable([...previous].reverse().concat(current))}`);
  }
  return { system, user: parts.join("\n\n") };
}

// ── Saved reviews (this device; part of the backup) ──

const SAVED_KEY = "metbarista_ai_reviews";
export interface SavedReview { at: number; provider: string; model: string; text: string }

export function loadReview(shotTime: number): SavedReview | null {
  try { return (JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, SavedReview>)[String(shotTime)] ?? null; } catch { return null; }
}
export function saveReview(shotTime: number, r: SavedReview): void {
  try {
    const all = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, SavedReview>;
    all[String(shotTime)] = r;
    localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  } catch { /* storage full: the review shows until the page is left */ }
}
