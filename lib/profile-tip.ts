/**
 * The dial-in tip a profile carries in its description (MetProfiles and the
 * machine's own profiles usually have one): "Dial in a flow rate of 1.2 to
 * 1.8 ml/s…", "If you go over, you've ground too finely". Only the sentences
 * that say how to dial it in, as the profile's author wrote them.
 */

const TIP = /\b(dial(?:ed|ing)? in|aims?:|aim for|shoot for|grind|ground|if you|expect|adjust|use the)\b/i;

export function profileTips(description: string | null | undefined): string[] {
  if (!description?.trim()) return [];
  return description
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 8 && TIP.test(s) && !/^https?:|downloaded from|imported from/i.test(s));
}

const COUNT_KEY = "not9bar_profile_shots";
/** The tip shows for a profile's first shots on this tablet, then stays on its page */
export const TIP_SHOTS = 5;

function counts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(COUNT_KEY) ?? "{}") as Record<string, number>; } catch { return {}; }
}

/** Shots started from the Station with this base profile (this tablet) */
export function profileShotCount(id: string | null | undefined): number {
  return id ? counts()[id] ?? 0 : 0;
}

/** A shot started with this base profile */
export function countProfileShot(id: string | null | undefined): void {
  if (!id) return;
  const c = counts();
  c[id] = (c[id] ?? 0) + 1;
  try { localStorage.setItem(COUNT_KEY, JSON.stringify(c)); } catch { /* storage full */ }
}
