import Link from "next/link";
import type { Profile } from "@/lib/types";
import { ProfileCurvePreview } from "./charts/profile-curve-preview";
import { ProfileFingerprint } from "./charts/profile-fingerprint";
import { getSavedIp } from "@/lib/connection-store";
import { machineImageUrl, safeColor } from "@/lib/safe-url";

interface ProfileCardProps {
  profile: Profile;
  href?: string;
  /** "Use on Station": the profile becomes the recipe's base */
  onUse?: (profile: Profile) => void;
}

function getImageUrl(imagePath?: string): string | null {
  if (!imagePath) return null;
  const ip = getSavedIp();
  if (!ip) return null;
  return machineImageUrl(`http://${ip}`, imagePath);
}

export function ProfileCard({ profile, href, onUse }: ProfileCardProps) {
  const accent = safeColor(profile.display?.accentColor) ?? "#ffc400";
  const imageUrl = getImageUrl(profile.display?.image);

  const inner = (
    <div className="group rounded-2xl border border-[var(--ink)]/15 bg-[var(--ink)]/[0.04] overflow-hidden hover:border-[var(--ink)]/30 hover:bg-[var(--ink)]/[0.07] transition-all cursor-pointer">

      {/* Profile image or accent bar */}
      {imageUrl ? (
        <div className="relative h-20 overflow-hidden bg-[var(--paper)]">
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
        <div className="relative h-20 overflow-hidden bg-[var(--paper)]">
          <ProfileFingerprint profile={profile} height={80} accent={accent} />
          {/* subtle dark overlay so card text stays readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--paper)] via-transparent to-transparent opacity-60" />
        </div>
      )}

      {/* Shorter card, bigger words: more profiles per screen, and readable */}
      <div className={`px-3 pb-3 space-y-2 ${imageUrl ? "" : "pt-2"}`}>
        {/* Header row */}
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-[var(--ink)] truncate group-hover:text-[var(--accent)] transition-colors leading-snug">
            {profile.name}
          </h3>
          <p className="text-sm text-[var(--ink)]/65">{profile.author}</p>
        </div>

        {profile.display?.shortDescription && (
          <p className="text-sm text-[var(--ink)]/75 line-clamp-2 leading-snug">
            {profile.display.shortDescription}
          </p>
        )}

        {/* What it's designed for, one line */}
        <p className="text-sm tabular-nums text-[var(--ink)]/70">
          {profile.temperature} °C · {profile.final_weight} g · {profile.stages?.length ?? 0} stages
        </p>

        {onUse && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUse(profile); }}
            className="h-11 w-full rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--on-primary)] active:scale-[0.98]"
          >
            Use on Station →
          </button>
        )}
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
