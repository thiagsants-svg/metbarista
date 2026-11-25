/** Dates and times as the app shows them (English, the tablet's own time zone) */

/** "Nov 25" */
export const dayShort = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "Nov 25, 2026" */
export const dayYear = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
/** "07:42" */
export const timeHM = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
/** "Nov 25 · 07:42" */
export const dayTime = (ms: number) => `${dayShort(ms)} · ${timeHM(ms)}`;
