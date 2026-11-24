"use client";

/** DiFluid R2 refractometer (Bluetooth): its readings fill the rating popup's TDS field */

import { useRef, useState } from "react";
import { DifluidLink, type DifluidState } from "@/lib/difluid";

export function useDifluid(setError: (msg: string | null) => void) {
  const difluidRef = useRef<DifluidLink | null>(null);
  const [difluid, setDifluid] = useState<DifluidState>("off");
  const [deviceTds, setDeviceTds] = useState<{ value: number; at: number } | null>(null);
  /** What the R2 sent (and what was sent to it), newest last: shows whether it answers at all */
  const [difluidLog, setDifluidLog] = useState<string[]>([]);
  const log = (line: string) => {
    const t = new Date().toLocaleTimeString("en-US", { hour12: false });
    setDifluidLog((cur) => [...cur.slice(-7), `${t} ${line}`]);
  };

  /** First tap connects to the R2 (Chrome's list the first time); then it asks for a reading */
  function difluidTap() {
    if (!difluidRef.current) {
      difluidRef.current = new DifluidLink(
        (value) => { setDeviceTds({ value, at: Date.now() }); log(`TDS ${value.toFixed(2)}%`); },
        (state, err) => { setDifluid(state); if (err) setError(`DiFluid: ${err}`); },
        log,
      );
    }
    const link = difluidRef.current;
    if (link.connected) link.measure().catch((e) => setError(`DiFluid: ${e instanceof Error ? e.message : String(e)}`));
    else link.connect();
  }

  return { difluid, deviceTds, difluidLog, difluidTap };
}
