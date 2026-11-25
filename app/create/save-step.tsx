"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Copy, Coffee } from "lucide-react";
import { stagesToOEPF } from "@/lib/profile-builder";
import { saveProfile, loadProfileInline } from "@/lib/machine-api";
import { getSavedIp } from "@/lib/connection-store";
import type { ProfileBasics, StageConfig } from "@/lib/profile-builder";

interface Props {
  basics: ProfileBasics;
  stages: StageConfig[];
  onBack: () => void;
  onDone: () => void;
}

type SaveState = "idle" | "saving" | "done" | "error";

const STAGE_COLOR: Record<string, string> = {
  pressure: "#60a5fa",
  flow: "#22d3ee",
};

export function SaveStep({ basics, stages, onBack, onDone }: Props) {
  const [state, setState] = useState<SaveState>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadAfterSave, setLoadAfterSave] = useState(false);

  const profile = stagesToOEPF(basics, stages);
  const totalSec = stages.reduce((n, s) => n + s.duration, 0);
  const hasMachine = Boolean(getSavedIp());

  async function handleSave() {
    // Saving writes a new profile on the machine (and loading it makes it heat): ask first
    const ask = loadAfterSave
      ? `Save "${profile.name}" on the machine and load it?

Loading starts it: the machine heats and waits for you.`
      : `Save "${profile.name}" on the machine?`;
    if (!window.confirm(ask)) return;
    setState("saving");
    try {
      await saveProfile(profile);
      if (loadAfterSave) await loadProfileInline(profile);
      setState("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Failed to save");
      setState("error");
    }
  }

  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "saving") return (
    <div className="flex flex-col items-center gap-4 py-24">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-[var(--ink)]/70">Saving to machine…</p>
    </div>
  );

  if (state === "done") return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-[var(--primary)]/15 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-[var(--ink)]" />
      </div>
      <div>
        <p className="text-lg font-semibold text-[var(--ink)]">&ldquo;{basics.name}&rdquo; saved</p>
        {loadAfterSave && <p className="text-sm text-[var(--ink)]/70 mt-1">Profile is now active on your machine</p>}
      </div>
      <button onClick={onDone}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary)]/85 transition-all">
        <Coffee className="h-4 w-4" /> Go to Profiles
      </button>
    </div>
  );

  if (state === "error") return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
      </div>
      <div>
        <p className="font-semibold text-[var(--ink)]">Save failed</p>
        <p className="text-sm text-[var(--ink)]/70 mt-1">{errMsg}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setState("idle")}
          className="rounded-xl border border-[var(--ink)]/15 px-5 py-2.5 text-sm text-[var(--ink)]/85 hover:text-[var(--ink)] hover:bg-[var(--ink)]/[0.06] transition-all">
          Try again
        </button>
        <button onClick={handleCopyJson}
          className="rounded-xl border border-[var(--ink)]/15 px-5 py-2.5 text-sm text-[var(--ink)]/85 hover:text-[var(--ink)] hover:bg-[var(--ink)]/[0.06] transition-all">
          Copy JSON anyway
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ink)]">Review &amp; Save</h2>
        <p className="text-sm text-[var(--ink)]/70 mt-1">Looks good? Push it to your machine.</p>
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden">
        <div className="h-[3px]" style={{ backgroundColor: basics.accentColor }} />
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-[var(--ink)]">{basics.name}</p>
              {basics.author && <p className="text-xs text-[var(--ink)]/60 mt-0.5">by {basics.author}</p>}
              {basics.shortDescription && (
                <p className="text-sm text-[var(--ink)]/70 mt-2 leading-relaxed">{basics.shortDescription}</p>
              )}
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <p className="text-sm font-mono text-[var(--ink)]/70">{basics.temperature}°C</p>
              <p className="text-sm font-mono text-[var(--ink)]/70">{basics.targetWeight}g</p>
              <p className="text-xs font-mono text-[var(--ink)]/60">~{totalSec}s</p>
            </div>
          </div>

          {/* Stage pills */}
          <div className="flex flex-wrap gap-2">
            {stages.map((s) => (
              <span key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                style={{ color: STAGE_COLOR[s.type] ?? "#fafafa", borderColor: `${STAGE_COLOR[s.type]}30`, backgroundColor: `${STAGE_COLOR[s.type]}10` }}
              >
                <span className="h-1 w-1 rounded-full" style={{ backgroundColor: STAGE_COLOR[s.type] }} />
                {s.name} · {s.duration}s
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Options */}
      {hasMachine && (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={loadAfterSave} onChange={(e) => setLoadAfterSave(e.target.checked)}
            className="rounded accent-[var(--ink)]" />
          <span className="text-sm text-[var(--ink)]/70">Make this the active profile immediately</span>
        </label>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasMachine ? (
          <button onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary)]/85 transition-all shadow-[0_0_20px_rgba(255,196,0,0.2)]">
            <Coffee className="h-4 w-4" /> Save to Machine
          </button>
        ) : (
          <p className="text-sm text-[var(--ink)]/60 italic">Connect your machine to save directly.</p>
        )}
        <button onClick={handleCopyJson}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--ink)]/15 px-5 py-3 text-sm font-medium text-[var(--ink)]/70 hover:text-[var(--ink)] hover:bg-[var(--ink)]/[0.06] transition-all">
          <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy JSON"}
        </button>
        <button onClick={onBack}
          className="rounded-xl border border-[var(--ink)]/15 px-5 py-3 text-sm font-medium text-[var(--ink)]/60 hover:text-[var(--ink)] hover:bg-[var(--ink)]/[0.06] transition-all">
          ← Edit
        </button>
      </div>
    </div>
  );
}
