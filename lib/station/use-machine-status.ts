"use client";

/**
 * The machine's state for the app's header pill on every page (read only):
 * listens to the same live link as the Station, which shares it.
 */

import { useEffect, useState } from "react";
import { connectSocket, disconnectSocket } from "@/lib/machine-socket";
import { getSavedIp } from "@/lib/connection-store";
import type { LiveStatus } from "@/lib/types";

export function useMachineStatus(enabled: boolean): { connected: boolean; status: LiveStatus | null; preheatLeft: number } {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [preheatLeft, setPreheatLeft] = useState(0);

  useEffect(() => {
    if (!enabled || !getSavedIp()) return;
    const handlers: Parameters<typeof connectSocket>[0] = {
      connect: () => setConnected(true),
      disconnect: () => setConnected(false),
      error: () => setConnected(false),
      heater: setPreheatLeft,
      status: (s) => { setStatus(s); setConnected(true); },
    };
    connectSocket(handlers).catch(() => setConnected(false));
    return () => disconnectSocket(handlers);
  }, [enabled]);

  return { connected, status, preheatLeft };
}
