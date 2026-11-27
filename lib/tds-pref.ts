/**
 * Whether the after-shot popup shows the refractometer (TDS, DiFluid,
 * extraction): asked once in the first popup, changed on the Devices page.
 * null: not asked yet. Kept on this device (and in the backup).
 */

const KEY = "metbarista_tds_in_popup";

export type TdsPref = "yes" | "no" | null;

export function getTdsPref(): TdsPref {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch { return null; }
}

export function setTdsPref(v: "yes" | "no"): void {
  try { localStorage.setItem(KEY, v); } catch { /* storage full or blocked */ }
}
