"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProfileCurvePreview } from "@/components/charts/profile-curve-preview";
import { ProfileFingerprint } from "@/components/charts/profile-fingerprint";
import { Loader2, ArrowLeft, Thermometer, Weight, User, GitFork, Code } from "lucide-react";
import { listProfiles, getHistory, loadProfileById, computeShotStats } from "@/lib/machine-api";
import { getSavedIp } from "@/lib/connection-store";
import { ShotPlot } from "@/components/estacao-charts";
import { shotNotes, shotPoints } from "@/lib/coffee-history";
import { useStationTheme } from "@/lib/station/use-theme";
import type { Profile, ShotEntry } from "@/lib/types";

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  pressure: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  flow:     { bg: "rgba(34,211,238,0.12)", text: "#22d3ee" },
  power:    { bg: "rgba(167,139,250,0.12)", text: "#a78bfa" },
};

function ProfileDetailContent() {
  const { style } = useStationTheme();
  const params = useSearchParams();
  const id = params.get("id");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [relatedShots, setRelatedShots] = useState<ShotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [loadMsg, setLoadMsg] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([listProfiles(), getHistory()])
      .then(([profiles, shots]) => {
        const p = profiles.find((p) => p.id === id) ?? null;
        setProfile(p);
        if (p) {
          setRelatedShots(shots.filter((s) => s.profile?.id === id || s.name === p.name).slice(0, 3));
        }
      })
      .catch(() => {})
    .finally(() => setLoading(false));
  }, [id]);

  async function handleLoad() {
    if (!profile) return;
    try {
      await loadProfileById(profile.id);
      setLoadMsg({ type: "success", msg: "✓ Profile loaded to machine!" });
      setTimeout(() => setLoadMsg(null), 3000);
    } catch (error) {
      setLoadMsg({
        type: "error",
        msg: error instanceof Error ? error.message : "Failed to load profile",
      });
      setTimeout(() => setLoadMsg(null), 3000);
    }
  }

  if (loading) return (
    <div style={style} className="min-h-[60vh] bg-[var(--paper)] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  );

  if (!profile) return (
    <div style={style} className="min-h-[60vh] bg-[var(--paper)] flex items-center justify-center">
      <p className="text-[var(--ink)]/70 text-sm">Profile not found</p>
    </div>
  );

  const accent = profile.display?.accentColor ?? "#ffc400";
  const ip = getSavedIp();
  const imageUrl = profile.display?.image && ip ? `http://${ip}${profile.display.image}` : null;

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1 space-y-5">
        {/* Back */}
        <Link
          href="/profiles"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--ink)]/70 hover:text-[var(--ink)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Profiles
        </Link>

        {/* Profile header card */}
        <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden">
          {/* Cover photo — shown when available (machine-served image) */}
          {imageUrl && (
            <div className="relative h-56 sm:h-72 bg-[var(--paper)] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={profile.name}
                className="w-full h-full object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-[var(--paper)]/20 to-transparent" />
            </div>
          )}

          {/* Fingerprint — always shown as the data layer */}
          <div className="relative overflow-hidden bg-[var(--paper)]" style={{ height: imageUrl ? 72 : 112 }}>
            <ProfileFingerprint profile={profile} height={imageUrl ? 72 : 112} accent={accent} />
            {!imageUrl && (
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-[var(--paper)]/30 to-transparent" />
            )}
          </div>

          <div className="p-6 pt-4">
            {/* Name + author */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-[var(--ink)] leading-tight">{profile.name}</h1>
              <p className="text-sm text-[var(--ink)]/70 flex items-center gap-1.5 mt-1">
                <User className="h-3.5 w-3.5" />{profile.author}
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-1">
                {profile.display?.description && (
                  <p className="text-sm text-[var(--ink)]/70 max-w-2xl leading-relaxed">
                    {profile.display.description}
                  </p>
                )}
              </div>
            </div>

            {/* Spec pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-3 py-1 text-xs text-[var(--ink)]/85">
                <Thermometer className="h-3 w-3" />{profile.temperature}°C
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-3 py-1 text-xs text-[var(--ink)]/85">
                <Weight className="h-3 w-3" />{profile.final_weight}g target
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-3 py-1 text-xs text-[var(--ink)]/85">
                {(profile.stages ?? []).length} stages
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap mt-5 items-center">
              <button
                onClick={handleLoad}
                className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-[var(--primary)]/90 transition-colors"
              >
                ↳ Load to Machine
              </button>
              <Link
                href={`/share?id=${profile.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] px-4 py-2 text-sm font-medium text-[var(--ink)]/85 hover:text-[var(--ink)] hover:border-[var(--ink)]/30 transition-colors"
              >
                <GitFork className="h-3.5 w-3.5" /> Share
              </Link>
              {loadMsg && (
                <span className={`text-sm ${loadMsg.type === "success" ? "text-[var(--ink)]" : "text-red-400"}`}>
                  {loadMsg.msg}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-6">
          <h2 className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider mb-5">Profile Stages</h2>
          <div className="space-y-0">
            {(profile.stages ?? []).map((stage, i) => {
              const c = STAGE_COLORS[stage.type] ?? { bg: "rgba(255,196,0,0.1)", text: "#ffc400" };
              return (
                <div key={stage.key} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className="h-3 w-3 rounded-full border-2 mt-1 shrink-0"
                      style={{ borderColor: c.text, backgroundColor: c.bg }}
                    />
                    {i < profile.stages.length - 1 && (
                      <div className="w-px flex-1 bg-[var(--ink)]/[0.05] mt-1 mb-1" />
                    )}
                  </div>
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                        style={{ backgroundColor: c.bg, color: c.text }}
                      >
                        {stage.type}
                      </span>
                      <span className="text-sm font-medium text-[var(--ink)]">{stage.name}</span>
                      <span className="text-xs text-[var(--ink)]/60 ml-auto">over {stage.dynamics.over}</span>
                    </div>
                    <p className="text-xs text-[var(--ink)]/60">
                      {stage.dynamics.points.length} point{stage.dynamics.points.length !== 1 ? "s" : ""} · {stage.dynamics.interpolation} interpolation
                    </p>
                    {stage.exit_triggers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {stage.exit_triggers.map((t, ti) => (
                          <span
                            key={ti}
                            className="text-[10px] text-[var(--ink)]/60 border border-[var(--ink)]/15 rounded px-1.5 py-0.5"
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

        {/* Variables */}
        {(profile.variables ?? []).length > 0 && (
          <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-6">
            <h2 className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider mb-4">Variables</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(profile.variables ?? []).map((v) => (
                <div key={v.key} className="rounded-xl bg-[var(--paper)] px-3 py-2.5">
                  <p className="text-[var(--ink)]/60 text-xs">{v.name}</p>
                  <p className="font-medium font-mono text-sm text-[var(--ink)] mt-0.5">
                    {v.value}{" "}
                    <span className="text-xs text-[var(--ink)]/60">{v.type}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Author lineage */}
        {(profile.previous_authors ?? []).length > 0 && (
          <div className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] p-6">
            <h2 className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider mb-4 flex items-center gap-2">
              <GitFork className="h-3.5 w-3.5" /> Lineage
            </h2>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {(profile.previous_authors ?? []).map((a, i) => (
                <span key={a.author_id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[var(--ink)]/60">→</span>}
                  <span className="rounded-full bg-[var(--ink)]/[0.05] px-2.5 py-0.5 text-[var(--ink)]/70">{a.name}</span>
                </span>
              ))}
              <span className="text-[var(--ink)]/60">→</span>
              <span className="rounded-full bg-[var(--primary)]/10 text-[var(--accent)] px-2.5 py-0.5 font-medium border border-[var(--accent)]/40">{profile.author}</span>
            </div>
          </div>
        )}

        {relatedShots.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-[var(--ink)]/70 uppercase tracking-wider mb-4">Shots with this profile</h2>
            <div className="space-y-3">
              {relatedShots.map((shot) => {
                const stats = computeShotStats(shot.data);
                const coffee = shotNotes(shot).coffee;
                return (
                  <div key={shot.id} className="rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--ink)]/15">
                      <span className="text-sm font-medium text-[var(--ink)]/85">
                        {new Date(shot.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
                        {coffee ? ` · ${coffee}` : ""}
                      </span>
                      <Link href={`/shots?shot=${shot.id}`} className="text-sm font-semibold tabular-nums underline underline-offset-2">
                        {stats.durationSec}s · {stats.finalWeight.toFixed(1)} g
                      </Link>
                    </div>
                    <div className="relative h-44 px-2 pb-2">
                      <ShotPlot data={shotPoints(shot)} targetWeight={null} currentStage={null} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Raw JSON */}
        <div>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--ink)]/60 hover:text-[var(--ink)] transition-colors"
          >
            <Code className="h-3 w-3" />
            {showRaw ? "Hide" : "View"} Raw Profile JSON (OEPF)
          </button>
          {showRaw && (
            <pre className="mt-3 text-xs bg-[var(--ink)]/[0.04] border border-[var(--ink)]/15 rounded-xl p-4 overflow-auto max-h-96 font-mono text-[var(--ink)]/70 leading-relaxed">
              {JSON.stringify(profile, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] bg-[var(--paper)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    }>
      <ProfileDetailContent />
    </Suspense>
  );
}
