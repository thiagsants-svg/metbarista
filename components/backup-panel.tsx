"use client";

/**
 * Header button + popup to save the Station's tablet data to a file (share
 * sheet on Android: Drive, e-mail… or a plain download) and to restore it.
 * The button shows a dot when there's no backup from the last 14 days.
 */

import { useRef, useState, useSyncExternalStore } from "react";
import { DatabaseBackup, Download, Loader2, Upload, X } from "lucide-react";
import { headerButton, headerWord } from "@/components/station/station-header";
import { allPhotos, replaceAllPhotos } from "@/lib/coffee-photos";
import {
  BACKUP_AT_KEY, backupFileName, backupSummary, makeBackup, readBackup, restoreBackup, type Backup,
} from "@/lib/backup";

const noSubscribe = () => () => {};
const STALE_MS = 14 * 24 * 3600 * 1000;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

export function BackupButton() {
  const [open, setOpen] = useState(false);
  const [savedNow, setSavedNow] = useState<string | null>(null);
  // Read after hydration (the page is pre-rendered without the tablet's data)
  const stored = useSyncExternalStore(noSubscribe, () => localStorage.getItem(BACKUP_AT_KEY), () => undefined);
  const lastAt = savedNow ?? stored ?? null;
  const stale = stored !== undefined && (!lastAt || Date.parse(lastAt) < Date.parse(new Date().toDateString()) - STALE_MS);
  // The dot says what it means: how long since the last backup
  const daysAgo = lastAt ? Math.round((Date.parse(new Date().toDateString()) - Date.parse(new Date(lastAt).toDateString())) / 86_400_000) : null;
  const staleText = daysAgo == null ? "No backup yet" : `Last backup ${daysAgo} days ago`;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={stale ? `Backup: ${staleText}` : "Backup"} title={stale ? staleText : "Backup"}
        className={`relative ${headerButton} ${stale ? "border-[var(--accent)]/60" : ""}`}>
        <DatabaseBackup className="h-5 w-5" />
        <span className={`${headerWord} ${stale ? "text-[var(--accent)]" : ""}`}>
          {stale ? (daysAgo == null ? "No backup" : `Backup · ${daysAgo} d`) : "Backup"}
        </span>
        {stale && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)] md:hidden" />}
      </button>
      {open && <BackupPanel lastAt={lastAt} onSaved={setSavedNow} onClose={() => setOpen(false)} />}
    </>
  );
}

function BackupPanel({ lastAt, onSaved, onClose }: {
  lastAt: string | null; onSaved: (iso: string) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [current] = useState(() => backupSummary(makeBackup(localStorage)));

  async function save() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const now = new Date();
      // Bag photos too (they live outside localStorage)
      // Bag photos too (they live outside localStorage). If they can't be read, the file goes
      // without them (and says so), rather than with an empty list that would wipe them on restore
      const photos = await allPhotos().catch(() => null);
      const backup = { ...makeBackup(localStorage, now), ...(photos ? { photos } : {}) };
      if (!photos) setError("The bag photos couldn't be read: this backup has everything else.");
      const file = new File([JSON.stringify(backup, null, 1)], backupFileName(now), { type: "application/json" });
      let done = false;
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Station backup" });
          done = true;
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") { setBusy(false); return; }
          // Sharing failed: fall back to a download
        }
      }
      if (!done) {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url; a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      localStorage.setItem(BACKUP_AT_KEY, now.toISOString());
      onSaved(now.toISOString());
      setMessage(`Saved ${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function pick(f: File | undefined) {
    setError(null); setMessage(null); setPending(null);
    if (!f) return;
    try {
      setPending(readBackup(await f.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function restore() {
    if (!pending) return;
    try {
      restoreBackup(localStorage, pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    // Older backups have no photos: keep this device's
    const photos = pending.photos;
    (photos ? replaceAllPhotos(photos).catch(() => {}) : Promise.resolve()).then(() => location.reload());
  }

  const btn = "flex h-12 w-full items-center justify-center gap-2 rounded-md text-base font-semibold active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-[var(--paper)] p-4 text-[var(--ink)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--ink)]/70">Backup</p>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink)]/60">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-[var(--ink)]/75">
          Coffees, grinders, recipe, shot records, notes, TDS and next-shot plans live only in this tablet’s Chrome.
          Save a copy somewhere else (Drive, e-mail) to keep them if you reset or change tablets.
        </p>
        <div className="mt-3 rounded-md border border-[var(--ink)]/15 px-3 py-2 text-sm">
          <p><span className="text-[var(--ink)]/60">On this tablet:</span> <b>{current}</b></p>
          <p><span className="text-[var(--ink)]/60">Last backup:</span>{" "}
            <b className={lastAt ? "" : "text-[var(--accent)]"}>{day(lastAt) ?? "never"}</b></p>
        </div>

        {!pending && (
          <div className="mt-3 grid gap-2">
            <button onClick={save} disabled={busy} className={`${btn} bg-[var(--primary)] text-[var(--on-primary)]`}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Save backup
            </button>
            <button onClick={() => fileInput.current?.click()} disabled={busy}
              className={`${btn} border border-[var(--ink)]/25 text-[var(--ink)]/85`}>
              <Upload className="h-5 w-5" /> Restore from a file
            </button>
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        )}

        {pending && (
          <div className="mt-3 rounded-md border-2 border-[var(--accent)] p-3">
            <p className="text-sm font-semibold">Replace this tablet’s data with the backup from {day(pending.savedAt) ?? "?"}?</p>
            <p className="mt-1 text-sm text-[var(--ink)]/75">It has: {backupSummary(pending)}. What’s on the tablet now will be lost.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setPending(null)} className={`${btn} border border-[var(--ink)]/25 text-[var(--ink)]/85`}>Cancel</button>
              <button onClick={restore} className={`${btn} bg-[var(--accent)] text-[var(--paper)]`}>Replace</button>
            </div>
          </div>
        )}

        {message && <p className="mt-2 text-sm font-semibold text-[var(--ink)]/80">{message}</p>}
        {error && <p className="mt-2 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </div>
    </div>
  );
}
