"use client";

/** DiFluid R2 refractometer (Bluetooth): its readings fill the rating popup's TDS field */

import { useRef, useState } from "react";
import { DifluidLink, type DifluidState } from "@/lib/difluid";

export function useDifluid(setError: (msg: string | null) => void) {
  const difluidRef = useRef<DifluidLink | null>(null);
  const [difluid, setDifluid] = useState<DifluidState>("off");
  const [deviceTds, setDeviceTds] = useState<{ value: number; at: number } | null>(null);

  /** First tap connects to the R2 (Chrome's list the first time); then it asks for a reading */
  function difluidTap() {
    if (!difluidRef.current) {
      difluidRef.current = new DifluidLink(
        (value) => setDeviceTds({ value, at: Date.now() }),
        (state, err) => { setDifluid(state); if (err) setError(`DiFluid: ${err}`); },
      );
    }
    const link = difluidRef.current;
    if (link.connected) link.measure().catch((e) => setError(`DiFluid: ${e instanceof Error ? e.message : String(e)}`));
    else link.connect();
  }

  return { difluid, deviceTds, difluidTap };
}
