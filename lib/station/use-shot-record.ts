"use client";

/**
 * What the Station keeps about shots: the coffee's last shots (idle screen),
 * the plan decided after tasting, and the rating popup. When a shot starts it
 * notes the grinder and the machine's newest shot number; when it ends it
 * waits for the machine to save it, ties it by number to its coffee and grind,
 * and opens the rating popup.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ShotPoint } from "@/components/shot-charts";
import type { Face, PlanChoice } from "@/components/shot-rating";
import { fillCurves, getHistoryLight, getHistoryPicked, getShotRating, rateShot } from "@/lib/machine-api";
import { getShotNote, saveShotNote, saveShotPlan } from "@/lib/shot-notes";
import { composeShotNote } from "@/lib/shot-record";
import { takeDose } from "@/lib/coffees";
import { findNewShot, linkShot, pickRecentShots, recentShotsForCoffee, recordBrewGrind, rememberLatestShot, type CoffeeLastShot } from "@/lib/coffee-history";
import { loadPlan, savePlan, type NextPlan } from "@/lib/next-plan";
import { extractionYield, grindText, isMotto80, loadRecipe, type Recipe } from "@/lib/recipe";
import type { Motto80Link } from "@/lib/motto80";
import type { Profile, ShotEntry } from "@/lib/types";
import { shotFacts, type ShotFact } from "@/lib/shot-facts";
import { cupWeight } from "@/lib/cup-weight";
import type { Body } from "@/lib/taste-compass";

/** A rating saved before the machine had the shot: kept until it can be attached */
const PENDING_KEY = "metbarista_pending_rating";
interface PendingRating {
  startedAt: number;
  keyBefore: number | null;
  face: Face | null;
  rawNote: string;
  plan: PlanChoice | null;
  tds: number | null;
  body?: Body;
  dose: number;
}
/** The last shot that ended without a rating yet: survives a reload, so it can still be rated */
const UNRATED_KEY = "metbarista_unrated_shot";
interface UnratedShot { startedAt: number; keyBefore: number | null; dose: number }
/** Older than this, the "Rate last shot" button doesn't show */
const UNRATED_MAX_MS = 3 * 3600_000;
function readUnrated(): UnratedShot | null {
  if (typeof window === "undefined") return null;
  try {
    const u = JSON.parse(localStorage.getItem(UNRATED_KEY) ?? "null") as UnratedShot | null;
    return u && Date.now() - u.startedAt < UNRATED_MAX_MS ? u : null;
  } catch { return null; }
}

/** The time now, ms (a tap's handler, never a render) */
const nowMs = () => Date.now();

function readPending(): PendingRating | null {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingRating | null; } catch { return null; }
}

export function useShotRecord({ demo, profiles, recipe, brewing, purgeAsked, purging, idle, data, linkRef, setError }: {
  /** The machine is purging or raising the piston (also without a purge tap: auto purge) */
  purging: boolean;
  /** The machine is idle */
  idle: boolean;
  demo: boolean;
  profiles: Profile[];
  recipe: Recipe;
  /** The machine is extracting */
  brewing: boolean;
  /** The machine is waiting for a tap to purge (the Purge button is showing) */
  purgeAsked: boolean;
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
  /** What the curves of the shot that just ended show (null until it's saved) */
  const [lastFacts, setLastFacts] = useState<ShotFact[] | null>(null);
  /** What reached the cup in the shot that just ended, the last drops included (null until it's saved) */
  const [lastCup, setLastCup] = useState<number | null>(null);

  /** Shows the last shots on the idle screen, then their faces from the machine */
  function showRecent(list: CoffeeLastShot[]) {
    setRecentShots(list);
    if (demo) return;
    for (const shot of list) {
      if (!shot.shotId) continue;
      getShotRating(shot.shotId)
        .then((face) => setRecentShots((cur) => cur?.map((x) => x.dbKey === shot.dbKey ? { ...x, face } : x) ?? cur))
        .catch(() => { /* no face shown */ });
    }
  }

  /** A shot that ended and was never rated (e.g. the page reloaded): the idle screen offers it */
  const [unrated, setUnrated] = useState<UnratedShot | null>(() => readUnrated());

  /** The shot the open popup is about, fixed when it opens (a next shot can start meanwhile) */
  const ratingShotRef = useRef<{ found: Promise<ShotEntry | null> | null; startedAt: number; keyBefore: number | null; dose: number } | null>(null);

  /** Note, taste, TDS, plan and face put on the shot */
  async function attachRating(shot: ShotEntry, r: Omit<PendingRating, "startedAt" | "keyBefore">) {
    // The taste also goes in the shot's notes (Shots page); EY on what reached the cup
    const shotWeight = cupWeight(shot.data ?? []) || (data[data.length - 1]?.weight ?? 0);
    const note = composeShotNote({
      taste: r.plan?.taste,
      body: r.body,
      tds: r.tds ?? undefined,
      ey: r.tds != null ? extractionYield(r.tds, shotWeight, r.dose) ?? undefined : undefined,
      text: r.rawNote,
    });
    if (note) saveShotNote(shot.time, getShotNote(shot.time)?.rating ?? 0, note);
    // The plan also stays with the shot (the Shots page shows what was decided after it)
    if (r.plan) saveShotPlan(shot.time, r.plan);
    if (r.face) {
      const face = r.face;
      try {
        await rateShot(shot.id, face);
        setRecentShots((cur) => cur?.map((x) => x.dbKey === shot.db_key ? { ...x, face } : x) ?? cur);
      } catch (e) {
        setError(`Couldn't send the rating to the machine: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Face → the machine (shows in the official app); notes → the Shots page's Tasting Notes */
  async function saveRating(face: Face | null, rawNote: string, plan: PlanChoice | null, tds: number | null, body?: Body) {
    setRateOpen(false);
    if (demo) return;
    forgetUnrated();
    const snap = ratingShotRef.current;
    ratingShotRef.current = null;
    // What to change next time, kept for this coffee
    if (plan && recipe.coffee?.trim()) {
      const saved: NextPlan = { ...plan, coffee: recipe.coffee.trim(), at: nowMs() };
      savePlan(saved);
      setNextPlan(saved);
    }
    const rating = { face, rawNote, plan, tds, body, dose: snap?.dose ?? recipe.dose };
    // The shot is found by its number once the machine saves it (see waitForShot)
    const shot = await (snap?.found ?? (shotFoundRef.current ??= waitForShot()));
    if (!shot) {
      // Kept on the tablet: attached when the Station next reads the machine's shots
      try {
        const pending: PendingRating = {
          ...rating, startedAt: snap?.startedAt ?? shotStartedAtRef.current, keyBefore: snap?.keyBefore ?? keyBeforeShotRef.current,
        };
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      } catch { /* storage full: nothing more to do */ }
      setError("The shot isn't in the machine's history yet. Your rating is kept and will be added when the Station opens again.");
      return;
    }
    await attachRating(shot, rating);
  }

  /**
   * Waits (up to ~30 s) for the machine to save the shot that just ended, then
   * ties it by number to its coffee and grind and refreshes the idle list.
   */
  async function waitForShot(): Promise<ShotEntry | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        // Light list (no curves) to spot it, then its own curves only
        const light = findNewShot(await getHistoryLight(5), shotStartedAtRef.current, keyBeforeShotRef.current);
        if (!light) continue;
        const [shot] = await fillCurves([light]);
        linkShot(shot);
        const coffee = loadRecipe().coffee;
        const h = await getHistoryPicked(60, (l) => pickRecentShots(coffee, l).filter((s) => s.id !== shot.id))
          .then((list) => list.map((s) => (s.id === shot.id ? shot : s)))
          .catch(() => [shot]);
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
    const coffee = loadRecipe().coffee;
    getHistoryPicked(60, (light) => pickRecentShots(coffee, light)).then((h) => {
      showRecent(recentShotsForCoffee(coffee, h, profiles));
      setNextPlan(loadPlan(loadRecipe().coffee));
      // A rating saved before the machine had its shot: attach it now
      const pending = readPending();
      if (pending) {
        const shot = findNewShot(h, pending.startedAt, pending.keyBefore);
        if (shot) {
          localStorage.removeItem(PENDING_KEY);
          // Its curves give the weight in the cup, for the EY
          void fillCurves([shot]).then(([full]) => attachRating(full, pending));
        } else if (Date.now() - pending.startedAt > 24 * 3600_000) {
          localStorage.removeItem(PENDING_KEY); // too old to find
        }
      }
    }).catch(() => setRecentShots([]));
  // showRecent only uses state setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, profiles]);

  const wasBrewingRef = useRef(false);
  /** A shot ended and its rating popup hasn't opened yet */
  const rateDueRef = useRef(false);
  // Shot starts: record what the grinder had at that moment.
  // Shot over: record it under its coffee, so its last shot is found even months later.
  useEffect(() => {
    const started = !wasBrewingRef.current && brewing;
    const ended = wasBrewingRef.current && !brewing;
    wasBrewingRef.current = brewing;
    if (demo) return;
    if (started) {
      rateDueRef.current = false;
      shotStartedAtRef.current = Date.now();
      shotFoundRef.current = null;
      setLastFacts(null);
      setLastCup(null);
      keyBeforeShotRef.current = null;
      getHistoryLight(1).then((h) => { keyBeforeShotRef.current = h[0]?.db_key ?? null; }).catch(() => { /* time alone still works */ });
      // A frozen single dose of this coffee went into the shot
      takeDose(recipe.coffee);
      const g = linkRef.current?.connected ? linkRef.current.latest : null;
      if (g && isMotto80(recipe.grinder)) {
        recordBrewGrind(grindText({ grinder: recipe.grinder ?? "Motto 80", grindUm: g.bladeGap, feed: g.feedingRpm, rpm: g.grindRpm }));
      }
    }
    if (!ended) return;
    // Rate it once Purge is pressed (see the next effect): until then the
    // chart and the glass stay in view while the crema settles
    rateDueRef.current = true;
    // Kept on the tablet until it's rated or skipped (a reload must not lose it)
    try {
      localStorage.setItem(UNRATED_KEY, JSON.stringify({
        startedAt: shotStartedAtRef.current, keyBefore: keyBeforeShotRef.current, dose: recipe.dose,
      } satisfies UnratedShot));
    } catch { /* storage full */ }
    setUnrated(null);
    // Not cancelled on re-render: the record must happen once the machine has saved the shot
    shotFoundRef.current = waitForShot();
    shotFoundRef.current.then((s) => {
      if (!s) return;
      setLastFacts(shotFacts(s.data ?? [], s.profile?.stages ?? []));
      const cup = cupWeight(s.data ?? []);
      if (cup > 0) setLastCup(cup);
    }).catch(() => { /* no facts */ });
  // showRecent only uses state setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brewing, demo, profiles, recipe.grinder]);

  /** Opens the popup for the shot that just ended, and fixes which shot it is about */
  function openRating() {
    rateDueRef.current = false;
    ratingShotRef.current = {
      found: shotFoundRef.current, startedAt: shotStartedAtRef.current, keyBefore: keyBeforeShotRef.current, dose: recipe.dose,
    };
    setRateOpen(true);
  }

  // Rating popup: once Purge is pressed after a shot (on the Station or on the machine), i.e.
  // when the machine stops waiting for the purge tap; or when it purges by itself (auto purge)
  const wasPurgeAskedRef = useRef(false);
  useEffect(() => {
    const pressed = wasPurgeAskedRef.current && !purgeAsked;
    wasPurgeAskedRef.current = purgeAsked;
    if (!rateDueRef.current) return;
    if (pressed || (purging && !purgeAsked)) openRating();
  // openRating only reads refs and the recipe's dose
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purgeAsked, purging]);

  // A shot that ends with no purge at all (stopped, or purge off): open it once the machine
  // has sat idle for a few seconds
  useEffect(() => {
    if (!idle || !rateDueRef.current) return;
    const id = setTimeout(() => { if (rateDueRef.current) openRating(); }, 4000);
    return () => clearTimeout(id);
  // openRating only reads refs and the recipe's dose
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle]);

  function forgetUnrated() {
    try { localStorage.removeItem(UNRATED_KEY); } catch { /* nothing kept */ }
    setUnrated(null);
  }

  /** Skip: no rating for this shot, and no "Rate last shot" later */
  function skipRating() {
    setRateOpen(false);
    ratingShotRef.current = null;
    forgetUnrated();
  }

  /** "Rate last shot": the popup for a shot that ended before a reload, found by its start time */
  function rateUnrated() {
    const u = readUnrated();
    if (!u) { setUnrated(null); return; }
    shotStartedAtRef.current = u.startedAt;
    keyBeforeShotRef.current = u.keyBefore;
    shotFoundRef.current = waitForShot();
    ratingShotRef.current = { found: shotFoundRef.current, startedAt: u.startedAt, keyBefore: u.keyBefore, dose: u.dose };
    setUnrated(null);
    setRateOpen(true);
  }

  return {
    recentShots, nextPlan, setNextPlan, rateOpen, setRateOpen, showRecent, saveRating, lastFacts, lastCup,
    unrated: unrated && !rateOpen ? unrated : null, rateUnrated, skipRating,
  };
}
