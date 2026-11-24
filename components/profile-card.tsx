import Link from "next/link";
import { Thermometer, Weight, Layers } from "lucide-react";
import type { Profile } from "@/lib/types";
import { ProfileCurvePreview } from "./charts/profile-curve-preview";
import { ProfileFingerprint } from "./charts/profile-fingerprint";
import { getSavedIp } from "@/lib/connection-store";

interface ProfileCardProps {
  profile: Profile;
  href?: string;
  onLoad?: (profile: Profile) => void;
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  pressure: { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  flow:     { bg: "rgba(34,211,238,0.12)", text: "#22d3ee" },
  power:    { bg: "rgba(167,139,250,0.12)", text: "#a78bfa" },
};

function getImageUrl(imagePath?: string): string | null {
  if (!imagePath) return null;
  const ip = getSavedIp();
  if (!ip) return null;
  return `http://${ip}${imagePath}`;
}

export function ProfileCard({ profile, href, onLoad }: ProfileCardProps) {
  const accent = profile.display?.accentColor ?? "#ffc400";
  const stageTypes = [...new Set((profile.stages ?? []).map((s) => s.type))];
  const imageUrl = getImageUrl(profile.display?.image);

  const inner = (
    <div className="group rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden hover:border-[var(--ink)]/30 hover:bg-[var(--ink)]/[0.07] transition-all cursor-pointer">

      {/* Profile image or accent bar */}
      {imageUrl ? (
        <div className="relative h-36 overflow-hidden bg-[var(--paper)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={profile.name}
            className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
          />
          {/* Gradient overlay so text over image is readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-transparent to-transparent" />
          {/* Curve preview floated top-right */}
          <div className="absolute top-2 right-2 opacity-70 group-hover:opacity-100 transition-opacity">
            <ProfileCurvePreview profile={profile} width={72} height={28} accentColor={accent} />
          </div>
        </div>
      ) : (
        /* No official photo → generative fingerprint */
        <div className="relative h-36 overflow-hidden bg-[var(--paper)]">
          <ProfileFingerprint profile={profile} height={144} accent={accent} />
          {/* subtle dark overlay so card text stays readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-transparent to-transparent opacity-60" />
        </div>
      )}

      <div className={`px-4 pb-4 space-y-3 ${imageUrl ? "" : "pt-2"}`}>
        {/* Header row */}
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-[var(--ink)] truncate group-hover:text-[var(--accent)] transition-colors leading-snug">
            {profile.name}
          </h3>
          <p className="text-xs text-[var(--ink)]/60 mt-0.5">{profile.author}</p>
        </div>

        {profile.display?.shortDescription && (
          <p className="text-xs text-[var(--ink)]/70 line-clamp-2 leading-relaxed">
            {profile.display.shortDescription}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-[var(--ink)]/60">
          <span className="flex items-center gap-1">
            <Thermometer className="h-3 w-3" />{profile.temperature}°C
          </span>
          <span className="flex items-center gap-1">
            <Weight className="h-3 w-3" />{profile.final_weight}g
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />{profile.stages?.length ?? 0} stages
          </span>
        </div>

        {/* Stage badges */}
        <div className="flex flex-wrap gap-1.5">
          {stageTypes.map((t) => {
            const c = STAGE_COLORS[t] ?? { bg: "rgba(255,255,255,0.08)", text: "#fafafa" };
            return (
              <span key={t} className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                style={{ backgroundColor: c.bg, color: c.text }}>{t}</span>
            );
          })}
        </div>

        {onLoad && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLoad(profile); }}
            className="w-full rounded-lg border border-[var(--ink)]/15 bg-[var(--ink)]/[0.05] py-1.5 text-xs font-medium text-[var(--ink)]/70 hover:bg-[var(--primary)]/10 hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-all"
          >
            Load to Machine ↑
          </button>
        )}
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
