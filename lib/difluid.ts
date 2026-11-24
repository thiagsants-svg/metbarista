/**
 * DiFluid R2 Extract refractometer over Bluetooth (Web Bluetooth, Chrome on Android).
 *
 * DiFluid's own open protocol (github.com/DiFluid/difluid-sdk-demo, R2
 * firmware >= 2.1.2; the cleartext channel is on by default):
 * - Service 0x00FF, characteristic 0xAA01: write commands, notify results.
 * - Frame: DF DF <func> <cmd> <length> <data…> <checksum = sum of bytes & 0xFF>.
 * - Single test: func 3 (Device Action), cmd 0. Results come back as packages;
 *   package 2 ("Test result") carries the concentration (TDS %) × 100,
 *   big-endian. Average tests (cmd 1) add package 3 with the average.
 *
 * The Station listens (a test started on the R2 itself fills the TDS field)
 * and can ask for a single test. It never changes the R2's settings.
 *
 * DiFluid's own demo unlocks the cleartext channel after each power-on through
 * DiFluid's server (a developer key), so the R2 may stay silent on it. To see
 * what it really sends, the Station listens on every channel of the service
 * and reports each message (`onLog`).
 */

const SERVICE = 0x00ff;
const CHAR = 0xaa01;
const ACCESS_KEY = "metbarista_difluid_access";

/** DF DF func cmd len data checksum */
export function difluidFrame(func: number, cmd: number, data: number[] = []): Uint8Array {
  const out = new Uint8Array(data.length + 6);
  out.set([0xdf, 0xdf, func, cmd, data.length, ...data]);
  out[out.length - 1] = out.subarray(0, out.length - 1).reduce((s, b) => s + b, 0) & 0xff;
  return out;
}

export const SINGLE_TEST = difluidFrame(3, 0);

/**
 * TDS (%) from a result frame, or null for any other message (status, temperature,
 * settings, a broken frame). Single test: package 2; average test: package 3.
 */
export function parseDifluidTds(bytes: Uint8Array): number | null {
  if (bytes.length < 7 || bytes[0] !== 0xdf || bytes[1] !== 0xdf) return null;
  const func = bytes[2], cmd = bytes[3], len = bytes[4];
  if (bytes.length < 5 + len + 1) return null;
  const sum = bytes.subarray(0, 5 + len).reduce((s, b) => s + b, 0) & 0xff;
  if (sum !== bytes[5 + len]) return null;
  if (func !== 3 || (cmd !== 0 && cmd !== 1)) return null;
  const data = bytes.subarray(5, 5 + len);
  const resultPackage = cmd === 0 ? 2 : 3;
  if (data[0] !== resultPackage || data.length < 3) return null;
  // Signed (a test on water or air can read below zero)
  const tds = (((data[1] << 8) | data[2]) << 16 >> 16) / 100;
  return tds > 0 ? tds : null;
}

/**
 * Whole frames out of what has arrived so far: a notification may carry part
 * of a frame or several frames. Bytes before a DF DF header are dropped.
 */
export function splitFrames(buffer: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = [];
  let i = 0;
  while (i < buffer.length) {
    if (buffer[i] !== 0xdf || (i + 1 < buffer.length && buffer[i + 1] !== 0xdf)) { i++; continue; }
    if (i + 5 > buffer.length) break; // header and length not here yet
    const end = i + 6 + buffer[i + 4];
    if (end > buffer.length) break; // rest of the frame still coming
    frames.push(buffer.slice(i, end));
    i = end;
  }
  return { frames, rest: buffer.slice(i) };
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0").toUpperCase()).join(" ");

// Minimal Web Bluetooth types (not in TypeScript's DOM lib)
interface BtCharacteristic extends EventTarget {
  uuid: string;
  properties?: { notify?: boolean; indicate?: boolean };
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse?(data: BufferSource): Promise<void>;
  writeValue(data: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristic(uuid: number): Promise<BtCharacteristic>;
  getCharacteristics?(): Promise<BtCharacteristic[]>;
}
interface BtServer { connected: boolean; getPrimaryService(uuid: number): Promise<BtService>; disconnect(): void }
interface BtDevice extends EventTarget { name?: string; gatt?: { connect(): Promise<BtServer> } }
interface BtNavigator {
  bluetooth?: {
    requestDevice(options: { filters: { services: number[] }[]; optionalServices: number[] }): Promise<BtDevice>;
    getDevices?(): Promise<BtDevice[]>;
  };
}

export type DifluidState = "off" | "connecting" | "on";

/** One link to the R2: results arrive through `onTds` */
export class DifluidLink {
  private device: BtDevice | null = null;
  private server: BtServer | null = null;
  private char: BtCharacteristic | null = null;

  constructor(
    private onTds: (tds: number) => void,
    private onState: (s: DifluidState, error?: string) => void,
    /** Every message the R2 sends, and what the Station sends it (for diagnosis) */
    private onLog: (line: string) => void = () => {},
  ) {}

  get connected(): boolean {
    return !!this.server?.connected;
  }

  /** Needs a tap the first time (Chrome's list); a known R2 is reused */
  async connect(): Promise<void> {
    const bt = (navigator as unknown as BtNavigator).bluetooth;
    if (!bt) { this.onState("off", "this browser has no Bluetooth for web pages (use Chrome on the tablet)"); return; }
    if (this.connected) return;
    this.onState("connecting");
    try {
      if (!this.device) {
        const known = localStorage.getItem(ACCESS_KEY) ? ((await bt.getDevices?.().catch(() => [])) ?? []) : [];
        this.device = known.find((d) => /r2|difluid/i.test(d.name ?? ""))
          ?? await bt.requestDevice({ filters: [{ services: [SERVICE] }], optionalServices: [SERVICE] });
        this.device.addEventListener("gattserverdisconnected", () => { this.server = null; this.char = null; this.onState("off"); });
      }
      this.server = await this.device.gatt!.connect();
      const service = await this.server.getPrimaryService(SERVICE);
      this.char = await service.getCharacteristic(CHAR);
      localStorage.setItem(ACCESS_KEY, "1");
      // Listen on every channel: results may come on another one than the commands
      const all = (await service.getCharacteristics?.().catch(() => null)) ?? [this.char];
      const chars = all.some((c) => c.uuid === this.char!.uuid) ? all : [this.char, ...all];
      const names: string[] = [];
      for (const c of chars) {
        const short = c.uuid.slice(4, 8).toUpperCase();
        if (c !== this.char && c.properties && !c.properties.notify && !c.properties.indicate) continue;
        let pending: Uint8Array = new Uint8Array(0);
        c.addEventListener("characteristicvaluechanged", () => {
          const v = c.value;
          if (!v) return;
          const bytes = new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
          this.onLog(`${short} ← ${hex(bytes)}`);
          const joined = new Uint8Array(pending.length + bytes.length);
          joined.set(pending); joined.set(bytes, pending.length);
          const { frames, rest } = splitFrames(joined);
          pending = rest.length > 64 ? new Uint8Array(0) : rest;
          for (const fr of frames) {
            const tds = parseDifluidTds(fr);
            if (tds != null) this.onTds(tds);
          }
        });
        try { await c.startNotifications(); names.push(short); } catch { /* not a notify channel */ }
      }
      this.onLog(`connected · listening on ${names.join(", ") || "nothing"}`);
      this.onState("on");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "SecurityError" && this.device) { this.device = null; localStorage.removeItem(ACCESS_KEY); }
      this.onState("off", name === "NotFoundError" || name === "SecurityError" ? undefined : e instanceof Error ? e.message : String(e));
    }
  }

  /** Asks the R2 for a single test (the result comes through onTds) */
  async measure(): Promise<void> {
    if (!this.char) await this.connect();
    if (!this.char) return;
    const write = this.char.writeValueWithResponse?.bind(this.char) ?? this.char.writeValue.bind(this.char);
    await write(SINGLE_TEST as BufferSource);
    this.onLog(`AA01 → ${hex(SINGLE_TEST)} (measure)`);
  }

  disconnect(): void {
    if (this.server?.connected) this.server.disconnect();
    this.server = null;
    this.char = null;
    this.onState("off");
  }
}
