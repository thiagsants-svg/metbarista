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
interface BtDevice { gatt?: { connect(): Promise<BtServer> } }
interface BtNavigator {
  bluetooth?: {
    requestDevice(options: { filters: { namePrefix: string }[]; optionalServices: number[] }): Promise<BtDevice>;
  };
}

const SERVICE = 0xffff;
const WRITE_CHAR = 0xff01;
const NOTIFY_CHAR = 0xff02;

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as unknown as BtNavigator).bluetooth;
}

function frame(json: unknown, seq = 0): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(json));
  const out = new Uint8Array(8 + body.length);
  out.set([0xa5, 0x01, seq & 0xff, 0x00], 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/**
 * Asks Chrome to pick the grinder (the user taps it in the list), reads the
 * current settings once and disconnects, so the BOOKOO app can connect again.
 */
export async function readMotto80(timeoutMs = 8000): Promise<Motto80Reading> {
  const bt = (navigator as unknown as BtNavigator).bluetooth;
  if (!bt) throw new Error("This browser has no Bluetooth (use Chrome on the tablet)");

  const device = await bt.requestDevice({ filters: [{ namePrefix: "BOOKOO MT80" }], optionalServices: [SERVICE] });
  if (!device.gatt) throw new Error("Grinder not reachable");
  const server = await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(SERVICE);
    const write = await service.getCharacteristic(WRITE_CHAR);
    const notify = await service.getCharacteristic(NOTIFY_CHAR);

    const reading = new Promise<Motto80Reading>((resolve, reject) => {
      let buf: Uint8Array = new Uint8Array(0);
      const timer = setTimeout(() => reject(new Error("The grinder didn't answer (close the BOOKOO app and try again)")), timeoutMs);
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
            clearTimeout(timer);
            resolve({
              bladeGap: info.bladeGap, feedingRpm: info.feedingRpm, grindRpm: info.grindRpm,
              devState: info.devState, totalGrinds: info.totalGrinds,
            });
          }
        } catch { /* other message types: keep listening */ }
      });
    });

    await notify.startNotifications();
    await write.writeValueWithResponse(frame({ request: { appHello: { op: "handshake" } } }) as BufferSource);
    return await reading;
  } finally {
    if (server.connected) server.disconnect();
  }
}
