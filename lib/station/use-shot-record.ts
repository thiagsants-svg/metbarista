"use client";

/**
 * What the Station keeps about shots: the coffee's last shots (idle screen),
 * the plan decided after tasting, and the rating popup. When a shot starts it
 * notes the grinder and the machine's newest shot number; when it ends it
 * waits for the machine to save it, ties it by number to its coffee and grind,
 * and opens the rating popup.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ShotPoint } from "@/components/estacao-charts";
import type { Face, PlanChoice } from "@/components/shot-rating";
import { getHistory, getShotRating, rateShot } from "@/lib/machine-api";
import { getShotNote, saveShotNote } from "@/lib/shot-notes";
import { findNewShot, linkShot, recentShotsForCoffee, recordBrewGrind, rememberLatestShot, type CoffeeLastShot } from "@/lib/coffee-history";
import { loadPlan, savePlan, TASTE_LABEL, type NextPlan } from "@/lib/next-plan";
import { extractionYield, grindText, isMotto80, loadRecipe, tdsText, type Recipe } from "@/lib/recipe";
import type { Motto80Link } from "@/lib/motto80";
import type { Profile, ShotEntry } from "@/lib/types";

export function useShotRecord({ demo, profiles, recipe, brewing, data, linkRef, setError }: {
  demo: boolean;
  profiles: Profile[];
  recipe: Recipe;
  /** The machine is extracting */
  brewing: boolean;
  /** The shot's chart points (its final weight goes in the TDS note) */
  data: ShotPoint[];
  /** Motto 80 link: its reading at shot start is the shot's grind */
  linkRef: MutableRefObject<Motto80Link | null>;
  setError: (msg: string | null) => void;
}) {
  /** Last shots of the coffee in the recipe, for the idle screen (null while loading) */
  const [recentShots, setRecentShots] = useState<CoffeeLastShot[] | null>(null);
  /** What was decided after the coffee's last shot, shown over its shots */
  const [nextPlan, setNextPlan] = useState<NextPlan | null>(null);
  /** Rating popup after a shot */
  const [rateOpen, setRateOpen] = useState(false);
  const shotStartedAtRef = useRef(0);
  /** The machine's newest shot number before this shot, to tell the new one apart */
  const keyBeforeShotRef = useRef<number | null>(null);
  /** The shot that just ended, once the machine has saved it */
  const shotFoundRef = useRef<Promise<ShotEntry | null> | null>(null);

  /** Shows the last shots on the idle screen, then their faces from the machine */
  function showRecent(list: CoffeeLastShot[]) {
    setRecentShots(list);
    if (demo) return;
    for (const shot of list) {
      if (shot.dbKey == null) continue;
      getShotRating(shot.dbKey)
        .then((face) => setRecentShots((cur) => cur?.map((x) => x.dbKey === shot.dbKey ? { ...x, face } : x) ?? cur))
        .catch(() => { /* no face shown */ });
    }
  }

  /** Face → the machine (shows in the official app); notes → the Shots page's Tasting Notes */
  async function saveRating(face: Face | null, rawNote: string, plan: PlanChoice | null, tds: number | null) {
    setRateOpen(false);
    if (demo) return;
    // What to change next time, kept for this coffee
    if (plan && recipe.coffee?.trim()) {
      const saved: NextPlan = { ...plan, coffee: recipe.coffee.trim(), at: Date.now() };
      savePlan(saved);
      setNextPlan(saved);
    }
    // The taste also goes in the shot's notes (Shots page)
    const shotWeight = data[data.length - 1]?.weight ?? 0;
    const note = [
      plan ? TASTE_LABEL[plan.taste] : "",
      tds != null ? tdsText(tds, extractionYield(tds, shotWeight, recipe.dose)) : "",
      rawNote,
    ].filter(Boolean).join(" · ");
    // The shot is found by its number once the machine saves it (see waitForShot)
    const shot = await (shotFoundRef.current ??= waitForShot());
    if (!shot) {
      setError("Couldn't save the rating: the shot isn't in the machine's history yet. Add it on the Shots page.");
      return;
    }
    if (note) saveShotNote(shot.time, getShotNote(shot.time)?.rating ?? 0, note);
    if (face) {
      try {
        await rateShot(shot.db_key, face);
        setRecentShots((cur) => cur?.map((x) => x.dbKey === shot.db_key ? { ...x, face } : x) ?? cur);
      } catch (e) {
        setError(`Couldn't send the rating to the machine: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /**
   * Waits (up to ~30 s) for the machine to save the shot that just ended, then
   * ties it by number to its coffee and grind and refreshes the idle list.
   */
  async function waitForShot(): Promise<ShotEntry | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const shot = findNewShot(await getHistory(5), shotStartedAtRef.current, keyBeforeShotRef.current);
        if (!shot) continue;
        linkShot(shot);
        const h = await getHistory(60).catch(() => [shot]);
        rememberLatestShot(h, profiles, shot);
        showRecent(recentShotsForCoffee(loadRecipe().coffee, h, profiles));
        return shot;
      } catch { /* machine busy: try again */ }
    }
    return null;
  }

  // When the Station opens: last shots of the coffee in the recipe, or the machine's latest shots
  const lastLoadedRef = useRef(false);
  useEffect(() => {
    if (demo || lastLoadedRef.current || profiles.length === 0) return;
    lastLoadedRef.current = true;
    getHistory(60).then((h) => {
      showRecent(recentShotsForCoffee(loadRecipe().coffee, h, profiles));
      setNextPlan(loadPlan(loadRecipe().coffee));
    }).catch(() => setRecentShots([]));
  // showRecent only uses state setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, profiles]);

  const wasBrewingRef = useRef(false);
  // Shot starts: record what the grinder had at that moment.
  // Shot over: record it under its coffee, so its last shot is found even months later.
  useEffect(() => {
    const started = !wasBrewingRef.current && brewing;
    const ended = wasBrewingRef.current && !brewing;
    wasBrewingRef.current = brewing;
    if (demo) return;
    if (started) {
      shotStartedAtRef.current = Date.now();
      shotFoundRef.current = null;
      keyBeforeShotRef.current = null;
      getHistory(1).then((h) => { keyBeforeShotRef.current = h[0]?.db_key ?? null; }).catch(() => { /* time alone still works */ });
      const g = linkRef.current?.connected ? linkRef.current.latest : null;
      if (g && isMotto80(recipe.grinder)) {
        recordBrewGrind(grindText({ grinder: recipe.grinder ?? "Motto 80", grindUm: g.bladeGap, feed: g.feedingRpm, rpm: g.grindRpm }));
      }
    }
    if (!ended) return;
    // Rate it: once the cup is out (a short pause so the end of the chart shows first)
    setTimeout(() => setRateOpen(true), 1500);
    // Not cancelled on re-render: the record must happen once the machine has saved the shot
    shotFoundRef.current = waitForShot();
  // showRecent only uses state setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brewing, demo, profiles, recipe.grinder]);

  return { recentShots, nextPlan, setNextPlan, rateOpen, setRateOpen, showRecent, saveRating };
}
