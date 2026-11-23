/**
 * BOOKOO Motto 80 grinder over Bluetooth (Web Bluetooth, Chrome on Android).
 *
 * Read only. Protocol decoded from the official app's traffic:
 * - Service 4D543830-0001-4B80-8F00-424F4F4B4F4F ("MT80…BOOKOO"): -0002 = write
 *   (requests), -0003 = notify (data). (Service 0xFFFF / FF01 / FF02 is the
 *   chip's Wi-Fi setup channel, ESP BluFi: never used here.)
 * - Frame: a5 01 <seq> <flag> <length u32 LE> <UTF-8 JSON>.
 * - The grinder stays silent until the app says hello
 *   ({"request":{"appHello":{"op":"handshake"}}}); then FF02 sends
 *   {"broadcast":{"periodInfo":{bladeGap, feedingRpm, grindRpm, devState, ...}}}
 *   about 5 times a second.
 *
 * Only the handshake is ever written. No settings are sent to the grinder.
 *
 * The Station keeps one link open (see Motto80Link) so the grind fields
 * follow the grinder and the settings at the moment a shot starts can be
 * recorded. Disconnecting frees the grinder for the BOOKOO app.
 */

export interface Motto80Reading {
  /** Burr gap in microns */
  bladeGap: number;
  /** Feed speed (10–65) */
  feedingRpm: number;
  /** Burr speed (500–1500) */
  grindRpm: number;
  devState?: string;
  totalGrinds?: number;
}

// Minimal Web Bluetooth types (not in TypeScript's DOM lib)
interface BtCharacteristic extends EventTarget {
  value?: DataView;
  readValue(): Promise<DataView>;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse(data: BufferSource): Promise<void>;
}
interface BtService { getCharacteristic(uuid: string): Promise<BtCharacteristic> }
interface BtServer { connected: boolean; getPrimaryService(uuid: string): Promise<BtService>; disconnect(): void }
interface BtDevice extends EventTarget { name?: string; gatt?: { connected: boolean; connect(): Promise<BtServer> } }
interface BtNavigator {
  bluetooth?: {
    requestDevice(options: { filters: { namePrefix: string }[]; optionalServices: string[] }): Promise<BtDevice>;
    /** Devices this site was already allowed to use (no chooser); not on every Chrome */
    getDevices?(): Promise<BtDevice[]>;
  };
}

const SERVICE = "4d543830-0001-4b80-8f00-424f4f4b4f4f";
const WRITE_CHAR = "4d543830-0002-4b80-8f00-424f4f4b4f4f";
const NOTIFY_CHAR = "4d543830-0003-4b80-8f00-424f4f4b4f4f";
/** Set once Chrome has given access to SERVICE (older permissions only covered 0xFFFF) */
const ACCESS_KEY = "metbarista_grinder_access_v2";
const NAME_PREFIX = "BOOKOO MT80";

function bluetooth() {
  return typeof navigator === "undefined" ? undefined : (navigator as unknown as BtNavigator).bluetooth;
}

export function bluetoothSupported(): boolean {
  return !!bluetooth();
}

function frame(json: unknown, seq = 0): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(json));
  const out = new Uint8Array(8 + body.length);
  out.set([0xa5, 0x01, seq & 0xff, 0x00], 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** "lost": wanted but not connected (grinder asleep, page reopened): retrying, or waiting for a tap */
export type LinkState = "off" | "connecting" | "on" | "lost";

/** One open link to the grinder, reconnecting by itself if it drops. */
export class Motto80Link {
  private device: BtDevice | null = null;
  private server: BtServer | null = null;
  private wanted = false;
  private retries = 0;
  /** Latest reading (null until the first one arrives) */
  latest: Motto80Reading | null = null;

  constructor(
    private onReading: (r: Motto80Reading) => void,
    private onState: (s: LinkState, error?: string) => void,
  ) {}

  get connected(): boolean {
    return !!this.server?.connected;
  }

  /**
   * Connects. Needs a tap the first time (Chrome shows its device list);
   * afterwards the same device is reused without asking. With `silent`, only
   * a device Chrome already knows is used (no list): for reconnecting on its own.
   */
  async connect(silent = false): Promise<void> {
    const bt = bluetooth();
    if (!bt) throw new Error("This browser has no Bluetooth for web pages (use Chrome on the tablet)");
    if (this.connected) return;
    this.wanted = true;
    this.onState("connecting");
    try {
      if (!this.device) {
        // A device allowed before this channel was used must be chosen again once
        const known = localStorage.getItem(ACCESS_KEY) ? ((await bt.getDevices?.().catch(() => [])) ?? []) : [];
        const found = known.find((d) => d.name?.startsWith(NAME_PREFIX));
        if (!found && silent) throw Object.assign(new Error("needs a tap"), { name: "NeedsTap" });
        this.device = found
          ?? await bt.requestDevice({ filters: [{ namePrefix: NAME_PREFIX }], optionalServices: [SERVICE] });
        this.device.addEventListener("gattserverdisconnected", () => this.dropped());
      }
      await this.open();
      this.retries = 0;
      this.onState("on");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "SecurityError" && this.device) {
        // This device was allowed without the grinder's data channel: choose it again (one tap)
        this.device = null;
        localStorage.removeItem(ACCESS_KEY);
      }
      if (name === "NeedsTap" || name === "SecurityError") {
        // Can't open Chrome's list without a tap: wait for one
        this.onState("lost");
      } else if (name === "NotFoundError") {
        // List closed without choosing
        this.wanted = false;
        this.onState("off");
      } else if (this.device) {
        // Known grinder not answering (asleep, out of range): keep trying
        this.dropped();
      } else {
        this.wanted = false;
        this.onState("off", e instanceof Error ? e.message : String(e));
      }
      throw e;
    }
  }

  disconnect(): void {
    this.wanted = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.server?.connected) this.server.disconnect();
    this.server = null;
    this.onState("off");
  }

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private diag = { notes: 0, sizes: [] as number[], reads: 0, readSizes: [] as number[], readErr: "", start: "" };

  /** Turns received bytes into a reading. Frames may arrive whole, in pieces, or cut short. */
  private takeBytes(buf: { b: Uint8Array }, chunk: Uint8Array): void {
    const joined = new Uint8Array(buf.b.length + chunk.length);
    joined.set(buf.b); joined.set(chunk, buf.b.length);
    buf.b = joined[0] === 0xa5 ? joined : chunk[0] === 0xa5 ? chunk : new Uint8Array(0);
    if (buf.b.length < 8) return;
    const len = new DataView(buf.b.buffer, buf.b.byteOffset).getUint32(4, true);
    if (buf.b.length < 8 + len) return;
    const text = new TextDecoder().decode(buf.b.subarray(8, 8 + len));
    buf.b = new Uint8Array(0);
    this.takeText(text);
  }

  private takeText(text: string): void {
    // Field by field, so a message cut short still gives what it has
    const num = (k: string) => { const m = new RegExp(`"${k}":(-?\\d+)`).exec(text); return m ? Number(m[1]) : undefined; };
    const bladeGap = num("bladeGap");
    if (bladeGap == null || !/periodInfo/.test(text)) return;
    const r: Motto80Reading = {
      bladeGap,
      feedingRpm: num("feedingRpm") ?? this.latest?.feedingRpm ?? 0,
      grindRpm: num("grindRpm") ?? this.latest?.grindRpm ?? 0,
      devState: /"devState":"([A-Z_]+)"/.exec(text)?.[1],
      totalGrinds: num("totalGrinds"),
    };
    this.lastReadingAt = Date.now();
    const changed = !this.latest || this.latest.bladeGap !== r.bladeGap
      || this.latest.feedingRpm !== r.feedingRpm || this.latest.grindRpm !== r.grindRpm;
    this.latest = r;
    if (changed) this.onReading(r);
  }

  private lastReadingAt = 0;

  private async open(): Promise<void> {
    if (!this.device?.gatt) throw new Error("Grinder not reachable");
    this.server = await this.device.gatt.connect();
    const service = await this.server.getPrimaryService(SERVICE);
    localStorage.setItem(ACCESS_KEY, "1");
    const write = await service.getCharacteristic(WRITE_CHAR);
    const notify = await service.getCharacteristic(NOTIFY_CHAR);
    const buf = { b: new Uint8Array(0) as Uint8Array };
    this.diag = { notes: 0, sizes: [], reads: 0, readSizes: [], readErr: "", start: "" };
    notify.addEventListener("characteristicvaluechanged", () => {
      const v = notify.value;
      if (!v) return;
      const chunk: Uint8Array = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      this.diag.notes++;
      if (this.diag.sizes.length < 6) this.diag.sizes.push(chunk.length);
      if (!this.diag.start) this.diag.start = Array.from(chunk.subarray(0, 10), (x) => x.toString(16).padStart(2, "0")).join(" ");
      this.takeBytes(buf, chunk);
    });
    await notify.startNotifications();
    await write.writeValueWithResponse(frame({ request: { appHello: { op: "handshake" } } }) as BufferSource);

    // Plan B: messages may come cut short (Chrome may not ask Android for large
    // ones); a read gets the whole value. Read every second while no full message arrives.
    if (this.pollTimer) clearInterval(this.pollTimer);
    let reading = false;
    this.pollTimer = setInterval(async () => {
      if (!this.connected) { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null; return; }
      if (reading || Date.now() - this.lastReadingAt < 2500) return;
      reading = true;
      try {
        const v = await notify.readValue();
        const bytes: Uint8Array = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        this.diag.reads++;
        if (this.diag.readSizes.length < 4) this.diag.readSizes.push(bytes.length);
        const text = new TextDecoder().decode(bytes[0] === 0xa5 ? bytes.subarray(8) : bytes);
        this.takeText(text);
      } catch (e) {
        this.diag.readErr = e instanceof Error ? e.message : String(e);
      } finally {
        reading = false;
      }
    }, 1000);

    // Still nothing after 6 s: say what arrived, to find out why
    const openedAt = Date.now();
    setTimeout(() => {
      if (!this.connected || this.lastReadingAt >= openedAt) return;
      const d = this.diag;
      this.onState("on", `connected, but no readings yet. Messages: ${d.notes} (sizes ${d.sizes.join(",") || "-"}; starts ${d.start || "-"}). `
        + `Reads: ${d.reads} (sizes ${d.readSizes.join(",") || "-"})${d.readErr ? `; read error: ${d.readErr}` : ""}`);
    }, 6000);
  }

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Link lost (grinder asleep, out of range): keep retrying while wanted (2, 4, 8, 16 s, then every 30 s). */
  private dropped(): void {
    this.server = null;
    if (!this.wanted || this.retryTimer) return;
    this.onState("lost");
    const wait = Math.min(30_000, 2000 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.wanted || this.connected) return;
      this.onState("connecting");
      this.open().then(() => { this.retries = 0; this.onState("on"); }).catch(() => this.dropped());
    }, wait);
  }
}
