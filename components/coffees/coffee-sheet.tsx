"use client";

/**
 * Add or edit a coffee: name (fixed once saved: shots carry it), roaster,
 * notes, where it is (in use, frozen, finished) and photos of the bag,
 * taken with the tablet's camera or picked from the gallery.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { addPhoto, deleteCoffeePhotos, deletePhoto, listPhotos, shrinkImage, type CoffeePhoto } from "@/lib/coffee-photos";
import { coffeeKey, deleteCoffee, getCoffee, saveCoffee, STATUS_LABEL, type Coffee, type CoffeeStatus } from "@/lib/coffees";

export function CoffeeSheet({ coffee, onClose, onChanged }: {
  /** null: a new coffee */
  coffee: Coffee | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(coffee?.name ?? "");
  const [roaster, setRoaster] = useState(coffee?.roaster ?? "");
  const [notes, setNotes] = useState(coffee?.notes ?? "");
  const [status, setStatus] = useState<CoffeeStatus>(coffee?.status ?? "open");
  const [photos, setPhotos] = useState<CoffeePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CoffeePhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** A new coffee gets saved as soon as a photo is added: from then on it's an existing one */
  const [created, setCreated] = useState(false);
  const isNew = !coffee && !created;
  const key = coffeeKey(name);
  const taken = isNew && !!key && !!getCoffee(name);

  useEffect(() => {
    if (!coffee) return;
    let alive = true;
    listPhotos(coffee.key).then((p) => { if (alive) setPhotos(p); }).catch(() => {});
    return () => { alive = false; };
  }, [coffee]);

  function save(): boolean {
    if (!key) { setError("Give the coffee a name"); return false; }
    if (taken) { setError("There's already a coffee with this name"); return false; }
    saveCoffee({ name, roaster, notes, status });
    if (!coffee) setCreated(true);
    onChanged();
    return true;
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    // A new coffee is saved first, so its photos have somewhere to go
    if (isNew && !save()) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const photo = await addPhoto(key, await shrinkImage(f));
        setPhotos((cur) => [...cur, photo]);
      }
      onChanged();
    } catch (e) {
      setError(`Couldn't keep the photo: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  }

  async function removePhoto(p: CoffeePhoto) {
    if (!window.confirm("Delete this photo?")) return;
    await deletePhoto(p.id).catch(() => {});
    setPhotos((cur) => cur.filter((x) => x.id !== p.id));
    setViewing(null);
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Delete ${name.trim()}? Its photos go too; its shots keep the name.`)) return;
    deleteCoffee(name);
    await deleteCoffeePhotos(key).catch(() => {});
    onChanged();
    onClose();
  }

  const field = "w-full rounded-md border border-[var(--ink)]/20 bg-transparent px-3 text-base placeholder:text-[var(--ink)]/45";
  const chip = (on: boolean) => `h-11 flex-1 rounded-md border px-3 text-sm font-semibold active:scale-[0.97] ${
    on ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--ink)]/25 text-[var(--ink)]/80"}`;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-[var(--paper)] p-4 text-[var(--ink)] shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">{isNew ? "New coffee" : "Coffee"}</p>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink)]/60">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!coffee ? (
          <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Name (as you'll pick it on the Station)"
            autoFocus disabled={created} className={`${field} mt-1 h-12 text-lg font-bold`} aria-label="Name" />
        ) : (
          <p className="mt-1 text-2xl font-bold">{coffee.name}</p>
        )}
        {taken && <p className="mt-1 text-sm text-[var(--accent)]">There&apos;s already a coffee with this name.</p>}

        <input value={roaster} onChange={(e) => setRoaster(e.target.value)} placeholder="Roaster (optional)"
          className={`${field} mt-3 h-11`} aria-label="Roaster" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          placeholder="Origin, process, roast date, notes on the bag… (optional)"
          className={`${field} mt-2 resize-none py-2`} aria-label="Notes" />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Where it is</p>
        <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Where it is">
          {(Object.keys(STATUS_LABEL) as CoffeeStatus[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={chip(status === s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {status === "finished" && (
          <p className="mt-1 text-sm text-[var(--ink)]/70">Finished coffees leave the Station&apos;s list; their shots stay.</p>
        )}

        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink)]/70">Bag photos</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <button key={p.id} type="button" onClick={() => setViewing(p)} className="aspect-square overflow-hidden rounded-md border border-[var(--ink)]/15">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-[var(--ink)]/25 text-sm font-semibold text-[var(--ink)]/70 active:scale-[0.98] disabled:opacity-50">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            Add photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {error && <p className="mt-2 text-sm font-semibold text-[var(--accent)]">{error}</p>}

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => { if (save()) onClose(); }} disabled={!key || taken}
            className="h-12 flex-1 rounded-md bg-[var(--primary)] text-base font-bold text-[var(--on-primary)] active:scale-[0.98] disabled:opacity-40">
            Save
          </button>
          {coffee && (
            <Link href={`/shots?coffee=${encodeURIComponent(coffee.name)}`}
              className="flex h-12 items-center rounded-md border border-[var(--ink)]/25 px-4 text-sm font-semibold text-[var(--ink)]/85">
              Its shots
            </Link>
          )}
        </div>
        {!isNew && (
          <button type="button" onClick={() => void remove()}
            className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]/60 underline underline-offset-2">
            <Trash2 className="h-4 w-4" /> Delete this coffee
          </button>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-[140] flex flex-col bg-black/90 p-3" onClick={(e) => { e.stopPropagation(); setViewing(null); }}>
          <div className="flex justify-end gap-2">
            <button onClick={(e) => { e.stopPropagation(); void removePhoto(viewing); }} aria-label="Delete photo"
              className="flex h-11 items-center gap-2 rounded-md bg-white/10 px-3 text-sm font-semibold text-white">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            <button aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-md bg-white/10 text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing.dataUrl} alt="" className="mx-auto mt-3 min-h-0 flex-1 object-contain" />
        </div>
      )}
    </div>
  );
}
