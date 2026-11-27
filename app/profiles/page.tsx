"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Layers, Plus } from "lucide-react";
import { useStationTheme } from "@/lib/station/use-theme";
import { useRouter } from "next/navigation";
import { listProfiles } from "@/lib/machine-api";
import { setStationProfile } from "@/lib/recipe";
import { getSavedIp, useRequireConnection } from "@/lib/connection-store";
import { ProfileCard } from "@/components/profile-card";
import type { Profile } from "@/lib/types";


export default function ProfilesPage() {
  useRequireConnection();
  const { style } = useStationTheme();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- no machine saved: nothing to load
    if (!getSavedIp()) { setLoading(false); return; }
    listProfiles()
      .then(setProfiles)
      .finally(() => setLoading(false));
  }, []);

  // "Use on Station": the profile becomes the recipe's base; the Station's slide loads it
  // (with the recipe, the retraction margin and the Bar down), nothing is written to the machine here
  function handleUse(profile: Profile) {
    setStationProfile(profile);
    router.push("/station");
  }

  if (loading) return (
    <div style={style} className="min-h-[60vh] bg-[var(--paper)] flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
    </div>
  );

  return (
    <div style={style} className="bg-[var(--paper)] text-[var(--ink)]">
      <div className="pt-1 space-y-3">
        {/* Filters, count and New profile */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-right text-sm text-[var(--ink)]/70">
              {profiles.length} on your machine
            </span>
            <Link href="/create"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 text-sm font-bold text-[var(--on-primary)] active:scale-[0.98] shrink-0">
              <Plus className="h-4 w-4" /> New profile
            </Link>
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
              href="/station"
              className="rounded-full border border-[var(--accent)]/40 bg-[var(--primary)]/10 px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--primary)]/20 transition-colors"
            >
              Go to the Station
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                href={`/profile?id=${profile.id}`}
                onUse={handleUse}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
