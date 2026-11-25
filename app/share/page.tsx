"use client";

import { safeColor } from "@/lib/safe-url";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProfileCurvePreview } from "@/components/charts/profile-curve-preview";
import { ShotPlot } from "@/components/shot-charts";
import { shotPoints } from "@/lib/coffee-history";
import { ArrowLeft, Loader2, GitFork, Share2, Code, Thermometer, Weight, Clock, Droplets, Gauge } from "lucide-react";
import { listProfiles, getHistory, computeShotStats } from "@/lib/machine-api";
import { useRequireConnection } from "@/lib/connection-store";
import type { Profile, ShotEntry } from "@/lib/types";
import { format } from "date-fns";

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  pressure: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  flow:     { bg: "rgba(34,211,238,0.12)", text: "#22d3ee" },
  power:    { bg: "rgba(167,139,250,0.12)", text: "#a78bfa" },
};

function ShareContent() {
  const params = useSearchParams();
  const id = params.get("id");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bestShot, setBestShot] = useState<ShotEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- no profile asked for: nothing to load
    if (!id) { setLoading(false); return; }
    Promise.all([listProfiles(), getHistory()])
      .then(([profiles, shots]) => {
        const p = profiles.find((p) => p.id === id) ?? null;
        setProfile(p);
        if (p) {
          const related = shots.filter((s) => s.profile?.id === id || s.name === p.name);
          const best = related.sort((a, b) => b.data.length - a.data.length)[0] ?? null;
          setBestShot(best);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  function copyJson() {
    if (!profile) return;
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  if (loading) return (
    <div className="bg-[var(--paper)] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  );

  if (!profile) return (
    <div className="bg-[var(--paper)] flex items-center justify-center">
      <p className="text-[var(--ink)]/70 text-sm">Profile not found</p>
    </div>
  );

  const accent = safeColor(profile.display?.accentColor) ?? "#ffc400";
  const stats = bestShot ? computeShotStats(bestShot.data) : null;

  return (
    <div className="bg-[var(--paper)]">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Back */}
        <Link
          href={`/profile?id=${profile.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink)]/70 hover:text-[var(--ink)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Profile
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-[var(--ink)]">Share Profile</h1>
          <p className="text-sm text-[var(--ink)]/60 mt-0.5">The geeky shareable card — everything about this shot</p>
        </div>

        {/* ─── THE SHARE CARD ─────────────────────────────────────── */}
        <div className="rounded-3xl border-2 border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden shadow-2xl">
          {/* Gradient header strip */}
          <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />

          <div className="p-6 space-y-6">
            {/* Title row */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-bold text-[var(--ink)]">{profile.name}</h2>
                  <span className="bg-[var(--primary)]/15 border border-[var(--accent)]/50 text-[var(--accent)] rounded-full text-xs px-3 py-1 font-medium">
                    OEPF
                  </span>
                </div>
                <p className="text-sm text-[var(--ink)]/60 font-mono">by {profile.author}</p>
                {profile.display?.shortDescription && (
                  <p className="text-sm text-[var(--ink)]/70 italic">&ldquo;{profile.display.shortDescription}&rdquo;</p>
                )}
              </div>
              <div className="shrink-0 hidden sm:block opacity-80">
                <ProfileCurvePreview profile={profile} width={120} height={55} accentColor={accent} />
              </div>
            </div>

            {/* Key specs pills */}
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 text-xs rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-2.5 py-1 text-[var(--ink)]/70">
                <Thermometer className="h-3 w-3" />{profile.temperature}°C
              </span>
              <span className="flex items-center gap-1.5 text-xs rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-2.5 py-1 text-[var(--ink)]/70">
                <Weight className="h-3 w-3" />{profile.final_weight}g
              </span>
              <span className="text-xs rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-2.5 py-1 text-[var(--ink)]/70">
                {profile.stages.length} stages
              </span>
              {profile.variables.map((v) => (
                <span key={v.key} className="text-xs rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-2.5 py-1 text-[var(--ink)]/70 font-mono">
                  {v.name}: {v.value}{v.type === "pressure" ? " bar" : v.type === "weight" ? "g" : ""}
                </span>
              ))}
            </div>

            {/* Shot Telemetry */}
            {bestShot && stats && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider border-b border-[var(--accent)]/50 pb-1.5 flex-1">
                    Shot Telemetry
                  </p>
                  <span className="text-xs text-[var(--ink)]/60 shrink-0">
                    {format(new Date(bestShot.time * 1000), "MMM d, yyyy")}
                  </span>
                </div>

                {/* Stat boxes */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: Clock, v: `${stats.durationSec}s`, l: "Duration" },
                    { icon: Weight, v: `${stats.finalWeight.toFixed(1)}g`, l: "Weight" },
                    { icon: Gauge, v: `${stats.maxPressure.toFixed(1)}b`, l: "Max P" },
                    { icon: Droplets, v: `${stats.maxFlow.toFixed(1)}`, l: "Max Flow" },
                  ].map(({ icon: Icon, v, l }) => (
                    <div key={l} className="bg-[var(--paper)] rounded-xl p-3 text-center">
                      <Icon className="h-3 w-3 mx-auto text-[var(--ink)]/60 mb-1" />
                      <p className="text-sm font-bold text-[var(--ink)]">{v}</p>
                      <p className="text-xs text-[var(--ink)]/60 mt-0.5">{l}</p>
                    </div>
                  ))}
                </div>

                {/* Shot chart */}
                <div className="rounded-xl bg-[var(--paper)] border border-[var(--ink)]/15 p-3">
                  <div className="relative h-52"><ShotPlot data={shotPoints(bestShot)} targetWeight={null} currentStage={null} /></div>
                </div>
              </div>
            )}

            {/* Stage stepper */}
            <div>
              <p className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider mb-3">Stages</p>
              <div className="space-y-0">
                {profile.stages.map((stage, i) => {
                  const c = STAGE_COLORS[stage.type] ?? { bg: "rgba(255,196,0,0.1)", text: "#ffc400" };
                  return (
                    <div key={stage.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className="h-2.5 w-2.5 rounded-full border-2 mt-1 shrink-0"
                          style={{ borderColor: c.text, backgroundColor: c.bg }}
                        />
                        {i < profile.stages.length - 1 && (
                          <div className="w-px flex-1 bg-[var(--ink)]/[0.05] mt-1 mb-1" />
                        )}
                      </div>
                      <div className="pb-3 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                            style={{ backgroundColor: c.bg, color: c.text }}
                          >
                            {stage.type}
                          </span>
                          <span className="text-sm font-medium text-[var(--ink)]">{stage.name}</span>
                          <span className="text-xs text-[var(--ink)]/60 ml-auto">over {stage.dynamics.over}</span>
                        </div>
                        {stage.exit_triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stage.exit_triggers.map((t, ti) => (
                              <span
                                key={ti}
                                className="text-xs text-[var(--ink)]/60 border border-[var(--ink)]/15 rounded px-1.5 py-0.5"
                              >
                                {t.type}: {t.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lineage */}
            {profile.previous_authors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider flex items-center gap-1.5">
                  <GitFork className="h-3 w-3" /> Lineage
                </p>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  {profile.previous_authors.map((a, i) => (
                    <span key={a.author_id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-[var(--ink)]/60">→</span>}
                      <span className="bg-[var(--ink)]/[0.05] rounded-full px-2.5 py-0.5 text-[var(--ink)]/70">{a.name}</span>
                    </span>
                  ))}
                  <span className="text-[var(--ink)]/60">→</span>
                  <span className="bg-[var(--primary)]/15 text-[var(--accent)] rounded-full px-2.5 py-0.5 font-medium border border-[var(--accent)]/50">{profile.author}</span>
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider">Raw JSON</p>
              <pre className="text-xs bg-[var(--paper)] border border-[var(--ink)]/15 rounded-xl p-4 overflow-auto max-h-64 font-mono text-[var(--ink)]/70 leading-relaxed">
                {JSON.stringify(profile, null, 2)}
              </pre>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--ink)]/15">
              <span className="text-xs text-[var(--ink)]/60">Shared via Not Nine Bar</span>
              <span className="text-xs text-[var(--ink)]/60 font-mono">{profile.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={copyJson}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/50 bg-transparent px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--primary)]/15 transition-colors"
          >
            <Code className="h-4 w-4" />
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)]/15 bg-transparent px-4 py-2 text-sm font-medium text-[var(--ink)]/85 hover:text-[var(--ink)] hover:border-[var(--ink)]/30 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            {copiedLink ? "Copied!" : "Copy Share Link"}
          </button>
          <a
            href="https://metprofiles.link"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--ink)]/15 bg-transparent px-4 py-2 text-sm font-medium text-[var(--ink)]/70 hover:text-[var(--ink)] hover:border-[var(--ink)]/30 transition-colors"
          >
            Submit to metprofiles.link ↗
          </a>
        </div>

        <p className="text-xs text-[var(--ink)]/60">
          💡 To share on Discord, copy the profile JSON and post it in the profiles channel, or submit to{" "}
          <a
            href="https://metprofiles.link"
            className="text-[var(--accent)] hover:text-[var(--accent)] transition-colors underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            metprofiles.link
          </a>.
        </p>
      </div>
    </div>
  );
}

export default function SharePage() {
  useRequireConnection();
  return (
    <Suspense fallback={
      <div className="bg-[var(--paper)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    }>
      <ShareContent />
    </Suspense>
  );
}
