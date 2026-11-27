/**
 * One temperature on its way to its goal: a bar that fills from where the
 * heating started, its colour going from cold blue to the heat colour as it
 * climbs (thermal scale; the theme's "good" green once there), with chevrons running along
 * it (>>>) while it still climbs.
 */

/** White chevrons, one every 20 px (the bar-stripes animation moves them 20 px) */
const CHEVRONS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M6 4 L12 10 L6 16' fill='none' stroke='white' stroke-opacity='0.45' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/** Thermal scale along the way: cold blue, cyan, yellow, orange, hot red */
const STOPS: [number, [number, number, number]][] = [
  [0, [59, 130, 246]], [0.35, [6, 182, 212]], [0.6, [234, 179, 8]], [0.85, [249, 115, 22]], [1, [239, 68, 68]],
];

function thermal(f: number): string {
  const x = Math.max(0, Math.min(1, f));
  const i = Math.max(1, STOPS.findIndex(([at]) => at >= x));
  const [a0, c0] = STOPS[i - 1];
  const [a1, c1] = STOPS[i];
  const k = (x - a0) / (a1 - a0 || 1);
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export function HeatBar({ label, value, start, goal, note, ready }: {
  label: string;
  value: number | null;
  /** Where it started (°C): the empty end of the bar */
  start: number | null;
  goal: number;
  /** "about 3 min", "ready", … */
  note: string | null;
  ready: boolean;
}) {
  const from = start != null && start < goal - 1 ? start : goal - 30;
  const share = value == null ? 0 : ready ? 1 : Math.max(0.04, Math.min(1, (value - from) / (goal - from)));
  const color = ready ? "var(--good)" : thermal(share);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate">
          <span className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">{label}</span>
          <span className="ml-2 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--ink)]">{value != null ? value.toFixed(1) : "—"}</span>
          <span className="ml-1 text-base text-[var(--ink)]/65">/ {goal} °C</span>
        </p>
        {note && <p className="shrink-0 text-base font-semibold" style={{ color: ready ? "var(--good)" : "var(--ink)" }}>{note}</p>}
      </div>
      <div className="mt-1 h-6 overflow-hidden rounded-full bg-[var(--ink)]/10">
        <div className={`h-full rounded-full transition-[width,background-color] duration-700 ${ready ? "" : "motion-safe:animate-bar-stripes"}`}
          style={{ width: `${share * 100}%`, backgroundColor: color, backgroundImage: ready ? undefined : CHEVRONS, backgroundSize: "20px 100%", backgroundRepeat: "repeat-x" }} />
      </div>
    </div>
  );
}
