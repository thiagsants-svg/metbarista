/**
 * The taste compass: one tap on a square says how the shot tasted on two
 * axes at once, sour ↔ bitter (left to right) and weak ↔ strong (bottom to
 * top). The idea is Barista Hustle's Espresso Compass, as Metic
 * (hessius/MeticAI) puts it after the shot; our own code.
 *
 * The point is kept as the same words as before ("Sour", "Balanced",
 * "Bitter"), plus the body when it isn't right ("Weak", "Strong").
 */

import { TASTE_LABEL, type Taste } from "./next-plan";

export type Body = "weak" | "strong";

export const BODY_LABEL: Record<Body, string> = { weak: "Weak", strong: "Strong" };

/**
 * Which way to move, as the Espresso Compass's arrows say: more yield moves a
 * shot weaker and more extracted, less yield stronger and less extracted;
 * extracting more (finer, warmer) or less (coarser, cooler) moves it across.
 */
export function compassHint(taste: Taste, body: Body | undefined): string | null {
  if (taste === "sour") {
    return body === "strong" ? "Under-extracted and strong: more yield (a longer ratio)"
      : `Under-extracted${body === "weak" ? " and weak" : ""}: extract more (finer or warmer)`;
  }
  if (taste === "bitter") {
    return body === "weak" ? "Over-extracted and weak: less yield (a shorter ratio)"
      : `Over-extracted${body === "strong" ? " and strong" : ""}: extract less (coarser or cooler)`;
  }
  if (body === "strong") return "Strong: more yield (a longer ratio)";
  if (body === "weak") return "Weak: less yield (a shorter ratio) or a bigger dose";
  return null;
}

/** Within this of the middle, an axis counts as fine */
export const COMPASS_DEADBAND = 0.25;

/** x: −1 sour … +1 bitter; y: −1 weak … +1 strong */
export interface CompassPoint { x: number; y: number }

export function compassTaste(p: CompassPoint): Taste {
  return p.x <= -COMPASS_DEADBAND ? "sour" : p.x >= COMPASS_DEADBAND ? "bitter" : "balanced";
}

export function compassBody(p: CompassPoint): Body | undefined {
  return p.y <= -COMPASS_DEADBAND ? "weak" : p.y >= COMPASS_DEADBAND ? "strong" : undefined;
}

/** Where a saved taste and body sit on the compass (to show an earlier answer) */
export function compassPoint(taste: Taste | undefined, body: Body | undefined): CompassPoint | null {
  if (!taste && !body) return null;
  return {
    x: taste === "sour" ? -0.6 : taste === "bitter" ? 0.6 : 0,
    y: body === "weak" ? -0.6 : body === "strong" ? 0.6 : 0,
  };
}

/** "Sour · Weak", "Balanced" */
export function compassText(taste: Taste | undefined, body: Body | undefined): string {
  return [taste ? TASTE_LABEL[taste] : "", body ? BODY_LABEL[body] : ""].filter(Boolean).join(" · ");
}
