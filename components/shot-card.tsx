"use client";

import Link from "next/link";
import { Clock, Weight, Gauge, Droplets, Star } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useEffect, useState, useMemo } from "react";
import type { ShotEntry } from "@/lib/types";
import { computeShotStats } from "@/lib/machine-api";
import { getShotNote } from "@/lib/shot-notes";
import { ShotScoreBadge } from "@/components/shot-report-card";
import { analyzeShot } from "@/lib/shot-analysis";

interface ShotCardProps {
  shot: ShotEntry;
  href?: string;
  compact?: boolean;
}

export function ShotCard({ shot, href, compact = false }: ShotCardProps) {
  const stats = computeShotStats(shot.data);
  const date = new Date(shot.time * 1000);
  const accent = shot.profile?.display?.accentColor ?? "#ffc400";
  const [rating, setRating] = useState<number | null>(null);
  const isThrowaway = useMemo(() => analyzeShot(shot).throwaway, [shot]);

  useEffect(() => {
    const saved = getShotNote(shot.time);
    if (saved?.rating) setRating(saved.rating);
  }, [shot.time]);

  const inner = (
    <div className={`group flex items-center gap-4 rounded-xl border border-white/[0.05] bg-[#141414] px-4 py-3.5 hover:border-white/[0.10] hover:bg-[#1c1c1c] transition-all cursor-pointer ${isThrowaway ? "opacity-40" : ""}`}>
      <div className="h-1.5 w-1.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: accent }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#fafafa] truncate group-hover:text-[#ffc400] transition-colors">{shot.name}</p>
        {!compact && (
          <p className="text-xs text-[#fafafa]/35 mt-0.5">
            {format(date, "MMM d, yyyy · HH:mm")} · {formatDistanceToNow(date, { addSuffix: true })}
          </p>
        )}
      </div>
      {rating && rating > 0 && (
        <div className="hidden sm:flex items-center gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              className="h-3 w-3"
              fill={rating >= s ? "#ffc400" : "none"}
              stroke={rating >= s ? "#ffc400" : "rgba(250,250,250,0.15)"}
            />
          ))}
        </div>
      )}
      <ShotScoreBadge shot={shot} size="xs" />
      {!compact && (
        <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-[#fafafa]/40 shrink-0">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{stats.durationSec}s</span>
          <span className="flex items-center gap-1"><Weight className="h-3 w-3" />{stats.finalWeight.toFixed(1)}g</span>
          <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{stats.maxPressure.toFixed(1)}b</span>
          <span className="flex items-center gap-1"><Droplets className="h-3 w-3" />{stats.maxFlow.toFixed(1)}</span>
        </div>
      )}
      <span className="text-xs font-mono text-[#fafafa]/20 shrink-0">#{shot.db_key}</span>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
