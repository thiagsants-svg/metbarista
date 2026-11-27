/**
 * The recipe in one line, shown in place of the recipe panel while the shot
 * runs (nothing in it can change then), so the chart gets the room.
 */

import { AutoBrewPicker } from "@/components/station/auto-brew-picker";
import type { AutoBrew } from "@/lib/station/auto-brew";
import { type Recipe, beverageWeight, formatRatio, grinderFields } from "@/lib/recipe";

function fmtDose(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

export function RecipeSummary({ profile, recipe, autoBrew, onAutoBrew }: {
  profile: string | null; recipe: Recipe;
  /** While heating: the Auto brew switch stays at hand (undefined: not shown) */
  autoBrew?: AutoBrew; onAutoBrew?: (v: AutoBrew) => void;
}) {
  const g = grinderFields(recipe);
  const grind = g.grindUm != null ? `grind ${g.grindUm}`
    : g.grindSetting != null ? `grind ${g.grindSetting}`
    : recipe.grind?.trim() || null;
  const parts = [
    `${fmtDose(recipe.dose)} g`,
    `${formatRatio(recipe.ratio)} → ${beverageWeight(recipe)} g`,
    `${recipe.temperature} °C`,
    grind,
  ].filter(Boolean);
  return (
    <div className="order-1 portrait:col-span-2 min-w-0 border-t-2 border-[var(--ink)] pt-2">
      <p className="truncate text-base leading-snug">
        <span className="font-bold">{profile ?? "Profile"}</span>
        <span className="text-[var(--ink)]/75"> · {parts.join(" · ")}</span>
      </p>
      {recipe.coffee && <p className="truncate text-sm text-[var(--ink)]/65">{recipe.coffee}</p>}
      {autoBrew !== undefined && onAutoBrew && (
        <div className="mt-1.5"><AutoBrewPicker value={autoBrew} onChange={onAutoBrew} /></div>
      )}
    </div>
  );
}
