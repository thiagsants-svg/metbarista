"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Layers, Plus } from "lucide-react";
import { useStationTheme } from "@/lib/station/use-theme";
import { listProfiles, loadProfileById } from "@/lib/machine-api";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import { ProfileCard } from "@/components/profile-card";
import type { Profile } from "@/lib/types";

const STYLE_FILTERS = ["All", "flow", "pressure", "power"];

type Toast = { type: "success" | "error"; msg: string } | null;

export default function ProfilesPage() {
  useRequireConnection();
  const { style } = useStationTheme();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (!getSavedIp()) { setLoading(false); return; }
    listProfiles()
      .then(setProfiles)
      .finally(() => setLoading(false));
  }, []);

  async function handleLoad(profile: Profile) {
    setLoadingId(profile.id);
    try {
      await loadProfileById(profile.id);
      setToast({ type: "success", msg: `✓ "${profile.name}" loaded to machine` });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setToast({
        type: "error",
        msg: error instanceof Error ? error.message : "Failed to load profile",
      });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingId(null);
    }
  }

  // Infer type from variables so this also works with lightweight profile lists.
  function inferTypes(p: Profile): string[] {
    const vtypes = new Set((p.variables ?? []).map((v) => v.type));
    const out: string[] = [];
    if (vtypes.has("pressure")) out.push("pressure");
    if (vtypes.has("flow")) out.push("flow");
    if (out.length === 0) out.push("power");
    return out;
  }

  const filtered = filter === "All"
    ? profiles
    : profiles.filter((p) => inferTypes(p).includes(filter));

  if (loading) return (
    <div style={style} className="min-h-[60vh] bg-[var(--paper)] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  );

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-4 space-y-5">
        {/* Header + filters */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Profiles</h1>
              <p className="text-sm text-[var(--ink)]/70">
                {profiles.length} profile{profiles.length !== 1 ? "s" : ""} on your machine
              </p>
            </div>
            <Link href="/create"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] active:scale-[0.98] shrink-0">
              <Plus className="h-4 w-4" /> New profile
            </Link>
          </div>
          <div className="flex gap-2 flex-wrap">
            {STYLE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-10 rounded-full border px-4 text-sm font-semibold capitalize active:scale-[0.97] ${
                  filter === f
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--ink)]/25 text-[var(--ink)]/80"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {!profiles.length ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
            <div className="rounded-full bg-[var(--primary)]/10 p-4">
              <Layers className="h-8 w-8 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-[var(--ink)]/85 text-sm">No profiles found.</p>
              <p className="text-[var(--ink)]/60 text-xs mt-0.5">Connect your machine first.</p>
            </div>
            <Link
              href="/estacao"
              className="rounded-full border border-[var(--accent)]/40 bg-[var(--primary)]/10 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--primary)]/20 transition-colors"
            >
              Go to the Station
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                href={`/profile?id=${profile.id}`}
                onLoad={loadingId === null ? handleLoad : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl transition-all z-50 ${
          toast.type === "success"
            ? "border-[var(--accent)]/40 bg-[var(--paper)] text-[var(--ink)]"
            : "border-red-500/20 bg-[var(--paper)] text-red-400"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
