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
