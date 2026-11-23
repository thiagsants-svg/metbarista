/**
 * BOOKOO Motto 80 grinder over Bluetooth (Web Bluetooth, Chrome on Android).
 *
 * Read only. Protocol decoded from the official app's traffic:
 * - Service 0xFFFF: FF01 = write (requests), FF02 = notify (data).
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
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithResponse(data: BufferSource): Promise<void>;
}
interface BtService { getCharacteristic(uuid: number): Promise<BtCharacteristic> }
interface BtServer { connected: boolean; getPrimaryService(uuid: number): Promise<BtService>; disconnect(): void }
interface BtDevice extends EventTarget { name?: string; gatt?: { connected: boolean; connect(): Promise<BtServer> } }
interface BtNavigator {
  bluetooth?: {
    requestDevice(options: { filters: { namePrefix: string }[]; optionalServices: number[] }): Promise<BtDevice>;
    /** Devices this site was already allowed to use (no chooser); not on every Chrome */
    getDevices?(): Promise<BtDevice[]>;
  };
}

const SERVICE = 0xffff;
const WRITE_CHAR = 0xff01;
const NOTIFY_CHAR = 0xff02;
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

export type LinkState = "off" | "connecting" | "on";

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
   * afterwards the same device is reused without asking.
   */
  async connect(): Promise<void> {
    const bt = bluetooth();
    if (!bt) throw new Error("This browser has no Bluetooth (use Chrome on the tablet)");
    if (this.connected) return;
    this.wanted = true;
    this.onState("connecting");
    try {
      if (!this.device) {
        const known = (await bt.getDevices?.().catch(() => [])) ?? [];
        this.device = known.find((d) => d.name?.startsWith(NAME_PREFIX))
          ?? await bt.requestDevice({ filters: [{ namePrefix: NAME_PREFIX }], optionalServices: [SERVICE] });
        this.device.addEventListener("gattserverdisconnected", () => this.dropped());
      }
      await this.open();
      this.retries = 0;
      this.onState("on");
    } catch (e) {
      this.wanted = false;
      // Chooser closed (NotFoundError) or no tap to open it (SecurityError): not worth an error
      const quiet = e instanceof Error && (e.name === "NotFoundError" || e.name === "SecurityError");
      this.onState("off", quiet ? undefined : e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  disconnect(): void {
    this.wanted = false;
    if (this.server?.connected) this.server.disconnect();
    this.server = null;
    this.onState("off");
  }

  private async open(): Promise<void> {
    if (!this.device?.gatt) throw new Error("Grinder not reachable");
    this.server = await this.device.gatt.connect();
    const service = await this.server.getPrimaryService(SERVICE);
    const write = await service.getCharacteristic(WRITE_CHAR);
    const notify = await service.getCharacteristic(NOTIFY_CHAR);
    let buf: Uint8Array = new Uint8Array(0);
    notify.addEventListener("characteristicvaluechanged", () => {
      const v = notify.value;
      if (!v) return;
      const chunk: Uint8Array = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      // A frame may arrive in pieces: join until the declared length is in
      const joined = new Uint8Array(buf.length + chunk.length);
      joined.set(buf); joined.set(chunk, buf.length);
      buf = joined[0] === 0xa5 ? joined : chunk[0] === 0xa5 ? chunk : new Uint8Array(0);
      if (buf.length < 8) return;
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(4, true);
      if (buf.length < 8 + len) return;
      const text = new TextDecoder().decode(buf.subarray(8, 8 + len));
      buf = new Uint8Array(0);
      try {
        const info = JSON.parse(text)?.broadcast?.periodInfo;
        if (info && typeof info.bladeGap === "number") {
          const r: Motto80Reading = {
            bladeGap: info.bladeGap, feedingRpm: info.feedingRpm, grindRpm: info.grindRpm,
            devState: info.devState, totalGrinds: info.totalGrinds,
          };
          const changed = !this.latest || this.latest.bladeGap !== r.bladeGap
            || this.latest.feedingRpm !== r.feedingRpm || this.latest.grindRpm !== r.grindRpm;
          this.latest = r;
          if (changed) this.onReading(r);
        }
      } catch { /* other message types */ }
    });
    await notify.startNotifications();
    await write.writeValueWithResponse(frame({ request: { appHello: { op: "handshake" } } }) as BufferSource);
  }

  /** Link lost (grinder asleep, out of range): retry a few times while wanted. */
  private dropped(): void {
    this.server = null;
    if (!this.wanted) return;
    if (this.retries >= 5) {
      this.wanted = false;
      this.onState("off", "Grinder disconnected");
      return;
    }
    this.onState("connecting");
    const wait = 2000 * 2 ** this.retries++;
    setTimeout(() => {
      if (!this.wanted) return;
      this.open().then(() => { this.retries = 0; this.onState("on"); }).catch(() => this.dropped());
    }, wait);
  }
}
