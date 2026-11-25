"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireConnection } from "@/lib/connection-store";
import { Coffee } from "lucide-react";
import {
  TEMPLATES, DEFAULT_BASICS, simulateStages, type ProfileBasics, type StageConfig, type Template } from "@/lib/profile-builder";
import { BuildStep } from "./build-step";
import { SaveStep } from "./save-step";

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["Template", "Build", "Save"] as const;
type Step = typeof STEPS[number];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${
            i === idx ? "text-[var(--accent)]" : i < idx ? "text-[var(--ink)]/70" : "text-[var(--ink)]/60"
          }`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
              i === idx ? "border-[var(--accent)]/50 bg-[var(--primary)]/15 text-[var(--accent)]"
              : i < idx  ? "border-[var(--accent)]/50 bg-[var(--primary)]/15 text-[var(--ink)]"
              : "border-[var(--ink)]/15 text-[var(--ink)]/60"
            }`}>
              {i < idx ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < STEPS.length - 1 && <div className="w-6 h-px bg-[var(--ink)]/[0.05]" />}
        </div>
      ))}
    </div>
  );
}

// ─── Template sparkline (SVG, no deps) ───────────────────────────────────────

function Sparkline({ template }: { template: Template }) {
  const pts = simulateStages(
    template.stages.map((s, i) => ({ ...s, id: String(i) }))
  );
  if (!pts.length) return null;
  const maxT = pts[pts.length - 1].t;
  const W = 120; const H = 36;
  const path = pts.map((p, i) => {
    const x = (p.t / maxT) * W;
    const y = H - (p.pressure / 12) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="opacity-60">
      <path d={path} fill="none" stroke={template.basics.accentColor ?? "#ffc400"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Template picker (step 1) ─────────────────────────────────────────────────

function TemplateStep({
  basics, setBasics, onChoose,
}: {
  basics: ProfileBasics;
  setBasics: (b: ProfileBasics) => void;
  onChoose: (t: Template) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)]">What kind of shot?</h2>
        <p className="text-sm text-[var(--ink)]/70 mt-1">Pick a starting point — you can tune every detail in the next step.</p>
      </div>

      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <button key={t.key} onClick={() => onChoose(t)}
            className="group rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-5 text-left hover:border-[var(--ink)]/30 hover:bg-[var(--ink)]/[0.07] transition-all">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="font-semibold text-[var(--ink)] group-hover:text-[var(--accent)] transition-colors">{t.label}</p>
                <p className="text-xs text-[var(--ink)]/60 mt-0.5 leading-relaxed">{t.description}</p>
              </div>
              <div className="h-4 w-4 rounded-full shrink-0 mt-0.5 border-2 border-[var(--ink)]/15 group-hover:border-[var(--accent)]/50 transition-colors" />
            </div>
            <Sparkline template={t} />
          </button>
        ))}
      </div>

      {/* Basic info */}
      <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-5 space-y-4">
        <p className="text-sm font-semibold text-[var(--ink)]/85">Basics</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--ink)]/70">Profile name</label>
            <input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })}
              className="w-full rounded-xl border border-[var(--ink)]/15 bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]/50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--ink)]/70">Your name (optional)</label>
            <input value={basics.author} onChange={(e) => setBasics({ ...basics, author: e.target.value })}
              placeholder="Anonymous"
              className="w-full rounded-xl border border-[var(--ink)]/15 bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]/50 placeholder:text-[var(--ink)]/60" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--ink)]/70">Temperature — {basics.temperature}°C</label>
            <input type="range" min={80} max={100} step={1} value={basics.temperature}
              onChange={(e) => setBasics({ ...basics, temperature: Number(e.target.value) })}
              className="w-full h-1 accent-[var(--ink)]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--ink)]/70">Target weight — {basics.targetWeight}g</label>
            <input type="range" min={20} max={60} step={1} value={basics.targetWeight}
              onChange={(e) => setBasics({ ...basics, targetWeight: Number(e.target.value) })}
              className="w-full h-1 accent-[var(--ink)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function CreatePage() {
  useRequireConnection();
  const router = useRouter();
  const [step, setStep] = useState<Step>("Template");
  const [basics, setBasics] = useState<ProfileBasics>(DEFAULT_BASICS);
  const [stages, setStages] = useState<StageConfig[]>([]);

  function chooseTemplate(t: Template) {
    setBasics((b) => ({ ...b, ...t.basics, name: b.name === DEFAULT_BASICS.name ? t.label : b.name }));
    setStages(t.stages.map((s, i) => ({ ...s, id: `${Date.now()}-${i}` })));
    setStep("Build");
  }

  return (
    <div className="bg-[var(--paper)]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[var(--primary)]/15 flex items-center justify-center">
              <Coffee className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--ink)]">Create Profile</h1>
              <p className="text-xs text-[var(--ink)]/60">Build a custom extraction recipe</p>
            </div>
          </div>
          <StepBar current={step} />
        </div>

        {step === "Template" && (
          <TemplateStep basics={basics} setBasics={setBasics} onChoose={chooseTemplate} />
        )}

        {step === "Build" && (
          <BuildStep
            basics={basics} setBasics={setBasics}
            stages={stages} setStages={setStages}
            onBack={() => setStep("Template")}
            onNext={() => setStep("Save")}
          />
        )}

        {step === "Save" && (
          <SaveStep
            basics={basics} stages={stages}
            onBack={() => setStep("Build")}
            onDone={() => router.push("/profiles")}
          />
        )}

      </div>
    </div>
  );
}
