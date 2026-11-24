"use client";

/** DiFluid R2 refractometer (Bluetooth): its readings fill the rating popup's TDS field */

import { useRef, useState } from "react";
import { DifluidLink, type DifluidState } from "@/lib/difluid";

/** A test takes a few seconds; past this, say the reading didn't come back */
const REPLY_MS = 12_000;

export function useDifluid(setError: (msg: string | null) => void) {
  const difluidRef = useRef<DifluidLink | null>(null);
  const [difluid, setDifluid] = useState<DifluidState>("off");
  const [deviceTds, setDeviceTds] = useState<{ value: number; at: number } | null>(null);
  /** Measure sent, reading not back yet */
  const [measuring, setMeasuring] = useState(false);
  /** The last Measure got no reading back */
  const [noReply, setNoReply] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWaiting = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setMeasuring(false);
  };

  /** First tap connects to the R2 (Chrome's list the first time); then it asks for a reading */
  function difluidTap() {
    if (!difluidRef.current) {
      difluidRef.current = new DifluidLink(
        // Also a test started on the R2 itself
        (value) => { setDeviceTds({ value, at: Date.now() }); setNoReply(false); stopWaiting(); },
        (state, err) => {
          setDifluid(state);
          if (state !== "on") stopWaiting();
          if (err) setError(`DiFluid: ${err}`);
        },
      );
    }
    const link = difluidRef.current;
    if (!link.connected) { link.connect(); return; }
    setNoReply(false);
    setMeasuring(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; setMeasuring(false); setNoReply(true); }, REPLY_MS);
    link.measure().catch((e) => { stopWaiting(); setError(`DiFluid: ${e instanceof Error ? e.message : String(e)}`); });
  }

  return { difluid, deviceTds, measuring, noReply, difluidTap };
}
