"use client";

/**
 * Machine messages (the same ones the dial shows, e.g. "Brewing has been
 * disabled because of a recent high strain on the motor…") as a big window
 * over the Station. Its buttons answer the machine like tapping them on the
 * dial; the window closes when the machine has no pending message left.
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { getProfileImageUrl, type MachineNotification } from "@/lib/machine-api";

function imageSrc(image: string | null | undefined): string | null {
  if (!image) return null;
  if (image.startsWith("data:") || image.startsWith("http")) return image;
  return getProfileImageUrl(image.startsWith("/") ? image : `/${image}`) || null;
}

export function MachineNotice({
  notices, busy, onRespond,
}: {
  notices: MachineNotification[];
  busy: boolean;
  onRespond: (notice: MachineNotification, response: string) => void;
}) {
  const notice = notices[0];
  if (!notice) return null;
  const responses = notice.responses?.length ? notice.responses : ["Ok"];
  const src = imageSrc(notice.image);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#ebeae6]/90 p-6"
      role="alertdialog" aria-modal="true" aria-label="Machine message">
      <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-md border-2 border-[#111] bg-transparent p-7 text-center">
        <div className="flex w-full items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#e30613]">Machine message</p>
          {notices.length > 1 && (
            <p className="text-sm text-[#111]/50">1 of {notices.length}</p>
          )}
        </div>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- image sent by the machine
          <img src={src} alt="" className="h-24 w-24 object-contain" />
        ) : (
          <AlertTriangle className="h-16 w-16 text-[#e30613]" />
        )}
        <p className="whitespace-pre-line text-2xl font-semibold leading-snug text-[#111]">{notice.message}</p>
        <div className="flex w-full flex-wrap justify-center gap-3">
          {responses.map((r, i) => (
            <button key={r} disabled={busy} onClick={() => onRespond(notice, r)}
              className={`min-h-[64px] min-w-[140px] flex-1 rounded-md px-6 text-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 ${
                i === 0
                  ? "bg-[#111] text-[#ebeae6]"
                  : "border border-black/20 bg-[#ebeae6] text-[#111]"
              }`}>
              {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
