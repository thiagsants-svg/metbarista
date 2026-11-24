/**
 * Notes kept on this device per shot (keyed by the shot's time, in seconds):
 * the text note (taste · TDS · EY · free text, see shot-record.ts), the old
 * star rating, and the next-shot plan decided after tasting it.
 */

import type { NextPlan } from "./next-plan";

const STORAGE_KEY = "metbarista_shot_notes";

/** What was decided after tasting a shot */
export type ShotPlan = Pick<NextPlan, "taste" | "temperature" | "ratio" | "grindDelta">;

type NoteRecord = { rating: number; note: string; savedAt: number; plan?: ShotPlan };
type NotesStore = Record<number, NoteRecord>;

function readStore(): NotesStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as NotesStore;
  } catch {
    return {};
  }
}

function writeStore(store: NotesStore): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
}

export function getShotNote(timestamp: number): { rating: number; note: string } | null {
  const store = readStore();
  const entry = store[timestamp];
  if (!entry) return null;
  return { rating: entry.rating, note: entry.note };
}

/** Saves the text note (keeps the plan already saved for the shot) */
export function saveShotNote(timestamp: number, rating: number, note: string): void {
  const store = readStore();
  store[timestamp] = { ...store[timestamp], rating, note, savedAt: Date.now() };
  writeStore(store);
}

/** The next-shot plan decided after tasting this shot, if one was saved with it */
export function getShotPlan(timestamp: number): ShotPlan | null {
  return readStore()[timestamp]?.plan ?? null;
}

export function saveShotPlan(timestamp: number, plan: ShotPlan): void {
  const store = readStore();
  const cur = store[timestamp];
  store[timestamp] = { rating: cur?.rating ?? 0, note: cur?.note ?? "", savedAt: Date.now(), plan };
  writeStore(store);
}

export function getAllNotes(): Record<number, { rating: number; note: string; savedAt: number }> {
  return readStore();
}
