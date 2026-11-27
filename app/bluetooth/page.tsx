"use client";

/**
 * Bluetooth devices: pair and test the grinder and the refractometer at any
 * time, outside the moments the Station expects them, with the full debug log
 * always on. Links opened here are closed when you leave the page, so the
 * Station (or the maker's app) can take the device again.
 */

import { getTdsPref, setTdsPref } from "@/lib/tds-pref";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, ChevronDown, Thermometer, Trash2 } from "lucide-react";
import { getKettleIp, readKettle, setKettleIp, type KettleReading } from "@/lib/kettle";
import { DifluidLink, type DifluidState } from "@/lib/difluid";
import { bluetoothSupported, Motto80Link, type LinkState, type Motto80Reading } from "@/lib/motto80";

const noSubscribe = () => () => {};
const clock = () => new Date().toLocaleTimeString("en-GB");

function useLog() {
  const [lines, setLines] = useState<string[]>([]);
  const add = useCallback((l: string) => setLines((x) => [...x.slice(-299), `${clock()}  ${l}`]), []);
  return { lines, add, clear: () => setLines([]) };
}

/** The debug log: kept all the time, shown on a tap (with its troubleshooting hint, if any) */
function Log({ lines, onClear, hint }: { lines: string[]; onClear: () => void; hint?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines, open]);
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} aria-expanded={false}
      className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--ink)]/20 px-3 text-sm font-semibold text-[var(--ink)]/75">
      Show log <ChevronDown className="h-4 w-4" />
    </button>
  );
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(false)} aria-expanded
          className="inline-flex min-h-11 items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--ink)]/65">
          Debug log <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
        <button onClick={onClear} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-[var(--ink)]/70"><Trash2 className="h-4 w-4" />Clear</button>
      </div>
      {hint && <p className="mb-1 text-xs text-[var(--ink)]/65">{hint}</p>}
      <pre ref={ref} className="mt-1 h-56 overflow-auto rounded-md bg-[var(--ink)]/[0.06] p-2 text-[11px] leading-snug whitespace-pre-wrap break-all">
        {lines.length ? lines.join("\n") : "Nothing yet."}
      </pre>
    </div>
  );
}

const btn = "min-h-11 rounded-md border border-[var(--ink)]/25 px-4 py-2 text-base font-semibold active:scale-95 disabled:opacity-40";
const STATE_LABEL: Record<string, string> = { on: "Connected", off: "Not connected", connecting: "Connecting…", lost: "Lost" };
const stateColor = (s: string) => (s === "on" ? "bg-[var(--good)]" : s === "connecting" ? "bg-[var(--warn)]" : s === "lost" ? "bg-[var(--bad)]" : "bg-[var(--ink)]/30");

function Card({ title, state, children, wifi }: { title: string; state: string; children: React.ReactNode; wifi?: boolean }) {
  return (
    <section className="rounded-lg border border-[var(--ink)]/15 p-4">
      <div className="flex items-center gap-2">
        {wifi ? <Thermometer className="h-5 w-5 text-[var(--accent)]" /> : <Bluetooth className="h-5 w-5 text-[var(--accent)]" />}
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${stateColor(state)}`} />{STATE_LABEL[state] ?? state}</span>
      </div>
      {children}
    </section>
  );
}

function GrinderCard() {
  const log = useLog();
  const [state, setState] = useState<LinkState>("off");
  const [reading, setReading] = useState<Motto80Reading | null>(null);
  const link = useRef<Motto80Link | null>(null);
  const add = log.add;
  useEffect(() => {
    const l = new Motto80Link(
      (r) => { setReading(r); add(`reading: gap ${r.bladeGap} µm · feed ${r.feedingRpm} · burr ${r.grindRpm} rpm${r.devState ? ` · ${r.devState}` : ""}`); },
      (s, err) => { setState(s); add(`state: ${s}${err ? ` · ${err}` : ""}`); },
    );
    link.current = l;
    return () => l.disconnect();
  }, [add]);
  const run = (f: () => Promise<void> | void) => Promise.resolve().then(f).catch((e) => log.add(`error: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`));
  return (
    <Card title="Grinder · BOOKOO Motto 80" state={state}>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => run(() => link.current?.connect())}>Connect</button>
        <button className={btn} onClick={() => run(() => link.current?.disconnect())}>Disconnect</button>
        <button className={btn} onClick={() => run(async () => { link.current?.forget(); log.add("forgot the device: the next Connect shows Chrome's list"); })}>Forget and choose again</button>
      </div>
      <p className="mt-3 text-sm">
        {reading ? <>Gap <b>{reading.bladeGap} µm</b> · feed {reading.feedingRpm} · burr {reading.grindRpm} rpm{reading.totalGrinds != null ? ` · ${reading.totalGrinds} grinds` : ""}</> : "No reading yet."}
      </p>
      <Log lines={log.lines} onClear={log.clear} />
    </Card>
  );
}

/** Whether the after-shot popup shows the TDS field (asked once in the first popup) */
function TdsPrefSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(getTdsPref() === "yes"); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <label className="mt-3 flex min-h-11 items-center gap-3 text-base">
      <input type="checkbox" className="h-6 w-6" checked={on}
        onChange={(e) => { setOn(e.target.checked); setTdsPref(e.target.checked ? "yes" : "no"); }} />
      Show the TDS after every shot
      <span className="text-sm text-[var(--ink)]/60">(always shown while the DiFluid is connected)</span>
    </label>
  );
}

function DifluidCard() {
  const log = useLog();
  const [state, setState] = useState<DifluidState>("off");
  const [tds, setTds] = useState<number | null>(null);
  const link = useRef<DifluidLink | null>(null);
  const add = log.add;
  useEffect(() => {
    const l = new DifluidLink(
      (t) => { setTds(t); add(`TDS ${t.toFixed(2)} %`); },
      (s, err) => { setState(s); add(`state: ${s}${err ? ` · ${err}` : ""}`); },
      (line) => add(line),
    );
    link.current = l;
    return () => l.disconnect();
  }, [add]);
  const run = (f: () => Promise<void> | void) => Promise.resolve().then(f).catch((e) => log.add(`error: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`));
  return (
    <Card title="Refractometer · DiFluid R2" state={state}>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => run(() => link.current?.connect())}>Connect</button>
        <button className={btn} disabled={state !== "on"} onClick={() => run(() => link.current?.measure())}>Measure</button>
        <button className={btn} onClick={() => run(() => link.current?.disconnect())}>Disconnect</button>
        <button className={btn} onClick={() => run(async () => { link.current?.forget(); log.add("forgot the device: the next Connect shows Chrome's list"); })}>Forget and choose again</button>
      </div>
      <p className="mt-3 text-sm">{tds != null ? <>Last TDS <b>{tds.toFixed(2)} %</b></> : "No result yet. Measure here, or press the button on the R2."}</p>
      <TdsPrefSwitch />
      <Log lines={log.lines} onClear={log.clear}
        hint={<>If it connects but no message ever arrives (no ← lines), the R2 may be locked to DiFluid&apos;s app: close the DiFluid app on your phone, turn the R2 off and on, and connect again.</>} />
    </Card>
  );
}

function KettleCard() {
  const log = useLog();
  const add = log.add;
  const [ip, setIp] = useState("");
  const [state, setState] = useState("off");
  const [reading, setReading] = useState<KettleReading | null>(null);
  const [watching, setWatching] = useState(false);
  useEffect(() => { setIp(getKettleIp()); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage, after hydration

  const once = useCallback(async (host: string, quiet = false) => {
    setState("connecting");
    try {
      const r = await readKettle(host, quiet ? () => {} : add);
      setReading(r); setState("on");
      add(`water ${r.temp ?? "—"}${r.target != null ? ` · set ${r.target}` : ""}${r.state ? ` · ${r.state}` : ""}`);
    } catch (e) {
      setState("off"); setWatching(false);
      add(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [add]);

  // Every 3 s while watching, the next read only after the last one finished
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => { await once(ip, true); if (alive) timer = setTimeout(loop, 3000); };
    timer = setTimeout(loop, 3000);
    return () => { alive = false; clearTimeout(timer); };
  }, [watching, ip, once]);

  return (
    <Card title="Kettle · Fellow Stagg EKG Pro (Wi-Fi)" state={state} wifi>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Kettle address on your Wi-Fi
          <input className="w-48 rounded-md border border-[var(--ink)]/25 bg-transparent px-3 py-2" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="192.168.1.20"
            value={ip} onChange={(e) => setIp(e.target.value)} />
        </label>
        <button className={btn} disabled={!ip.trim()} onClick={() => { setKettleIp(ip); void once(ip); }}>Read now</button>
        <button className={btn} disabled={!ip} onClick={() => { setKettleIp(ip); setWatching((w) => !w); }}>{watching ? "Stop" : "Follow every 3 s"}</button>
      </div>
      <p className="mt-3 text-sm">
        {reading ? <>Water <b>{reading.temp != null ? `${reading.temp}°` : "— (off the base?)"}</b>{reading.target != null ? ` · set to ${reading.target}°` : ""}{reading.state ? ` · ${reading.state}` : ""}</> : "No reading yet."}
      </p>
      <p className="mt-1 text-xs text-[var(--ink)]/65">
        Read only: it asks the kettle its temperature and nothing else. The address is in the Fellow app or your router&apos;s device list.
        If the reading fails with a network error, the kettle may not let web pages read it.
      </p>
      <Log lines={log.lines} onClear={log.clear} />
    </Card>
  );
}

export default function BluetoothPage() {
  // true on the server render, the real answer once in the browser (no hydration mismatch)
  const supported = useSyncExternalStore(noSubscribe, bluetoothSupported, () => true);
  return (
    <div className="pt-1 space-y-4">
      <p className="text-sm text-[var(--ink)]/70">
        Pair and test your devices at any time: the Bluetooth grinder and refractometer, and the kettle on your Wi-Fi. Everything they send is shown in the log. A device takes one connection at a time:
        close the maker&apos;s app first. Leaving this page disconnects them, so the Station can use them again.
      </p>
      {!supported && <p className="rounded-md bg-red-600/10 p-3 text-sm">This browser has no Bluetooth for web pages. Use Chrome on Android or a computer.</p>}
      <GrinderCard />
      <DifluidCard />
      <KettleCard />
    </div>
  );
}
