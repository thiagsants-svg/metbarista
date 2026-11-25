/**
 * A shot's own notes, as one line of text kept on this device:
 * "Sour · Weak · TDS 9.50% · EY 24.2% · chocolate, a bit sharp". The Station writes it
 * after tasting; the Shots page reads it back into its parts and can edit it.
 */

import { TASTE_LABEL, type Taste } from "./next-plan";
import { BODY_LABEL, type Body } from "./taste-compass";
import { tdsText } from "./recipe";

export interface ShotNoteParts {
  taste?: Taste;
  /** From the taste compass, when the body wasn't right */
  body?: Body;
  tds?: number;
  ey?: number;
  /** The free text (tasting notes) */
  text: string;
}

const TASTES = Object.entries(TASTE_LABEL) as [Taste, string][];
const BODIES = Object.entries(BODY_LABEL) as [Body, string][];

export function parseShotNote(note: string | null | undefined): ShotNoteParts {
  const out: ShotNoteParts = { text: "" };
  if (!note) return out;
  const rest: string[] = [];
  for (const raw of note.split(" · ")) {
    const seg = raw.trim();
    const taste = TASTES.find(([, label]) => label === seg)?.[0];
    const body = BODIES.find(([, label]) => label === seg)?.[0];
    const tds = /^TDS ([\d.]+)%$/.exec(seg)?.[1];
    const ey = /^EY ([\d.]+)%$/.exec(seg)?.[1];
    if (taste && out.taste == null && out.body == null && rest.length === 0) out.taste = taste;
    // The body comes first or right after the taste, before any free text
    else if (body && out.body == null && out.tds == null && rest.length === 0) out.body = body;
    else if (tds && out.tds == null) out.tds = Number(tds);
    else if (ey && out.ey == null) out.ey = Number(ey);
    else if (seg) rest.push(seg);
  }
  out.text = rest.join(" · ");
  return out;
}

export function composeShotNote(p: ShotNoteParts): string {
  return [
    p.taste ? TASTE_LABEL[p.taste] : "",
    p.body ? BODY_LABEL[p.body] : "",
    p.tds != null ? tdsText(p.tds, p.ey ?? null) : "",
    p.text.trim(),
  ].filter(Boolean).join(" · ");
}
