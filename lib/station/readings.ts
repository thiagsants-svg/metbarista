/**
 * The live readings the Station shows, read from the machine's status in one
 * place. On the Meticulous they come in `status.sensors` (p, f, w, g, t). A
 * fork for another machine changes `readingsOf()` (and TEMP_LABEL), and the
 * gauges, readouts and charts follow. A missing reading is `undefined`:
 * shown as "—", never as a 0.
 */

import type { LiveStatus } from "@/lib/types";

export interface Readings {
  /** bar */
  pressure?: number;
  /** ml/s: the water the machine pushes into the puck */
  flow?: number;
  /** g: the scale */
  weight?: number;
  /** g/s: the cup gaining weight, when the machine works it out (else the Station estimates it) */
  grav?: number;
  /** °C: the temperature the Station follows while heating */
  temp?: number;
}

/**
 * The name of `temp` on screen. The Meticulous reports the temperature of its
 * tube; a machine with a boiler would say "Boiler".
 */
export const TEMP_LABEL = "Tube";

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function readingsOf(s: LiveStatus | null | undefined): Readings {
  const x = s?.sensors;
  return { pressure: num(x?.p), flow: num(x?.f), weight: num(x?.w), grav: num(x?.g), temp: num(x?.t) };
}
