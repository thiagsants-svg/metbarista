/**
 * Bag photos, on this device. Pictures are too big for localStorage, so they
 * live in the browser's IndexedDB, shrunk to about 1280 px JPEG (~150 KB).
 * The backup file carries them too (see backup.ts).
 */

export interface CoffeePhoto {
  id: string;
  /** The coffee's key (coffees.ts) */
  coffee: string;
  /** data:image/jpeg;base64,… */
  dataUrl: string;
  /** ms */
  at: number;
}

const DB = "not9bar";
const STORE = "coffee_photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser can't keep photos")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("coffee", "coffee");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listPhotos(coffee: string): Promise<CoffeePhoto[]> {
  const list = (await run<CoffeePhoto[]>("readonly", (s) => s.index("coffee").getAll(coffee))) ?? [];
  return list.sort((a, b) => a.at - b.at);
}

export async function allPhotos(): Promise<CoffeePhoto[]> {
  return (await run<CoffeePhoto[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function addPhoto(coffee: string, dataUrl: string): Promise<CoffeePhoto> {
  const photo: CoffeePhoto = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, coffee, dataUrl, at: Date.now() };
  await run("readwrite", (s) => s.put(photo));
  // Ask the browser not to clear the photos when space runs low
  navigator.storage?.persist?.().catch(() => {});
  return photo;
}

export async function deletePhoto(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Restore: this device's photos become the backup's */
export async function replaceAllPhotos(photos: CoffeePhoto[]): Promise<void> {
  await run("readwrite", (s) => {
    s.clear();
    for (const p of photos) s.put(p);
  });
}

/** A camera photo shrunk to `max` px on its long side, as JPEG */
export async function shrinkImage(file: Blob, max = 1280, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export async function deleteCoffeePhotos(coffee: string): Promise<void> {
  for (const p of await listPhotos(coffee)) await deletePhoto(p.id);
}
