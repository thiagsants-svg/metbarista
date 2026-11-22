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
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      role="alertdialog" aria-modal="true" aria-label="Machine message">
      <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border-2 border-[#ffc400] bg-[#141414] p-7 text-center shadow-[0_0_60px_rgba(255,196,0,0.25)]">
        <div className="flex w-full items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#ffc400]">Machine message</p>
          {notices.length > 1 && (
            <p className="text-sm text-[#fafafa]/50">1 of {notices.length}</p>
          )}
        </div>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- image sent by the machine
          <img src={src} alt="" className="h-24 w-24 object-contain" />
        ) : (
          <AlertTriangle className="h-16 w-16 text-[#ffc400]" />
        )}
        <p className="whitespace-pre-line text-2xl font-semibold leading-snug text-[#fafafa]">{notice.message}</p>
        <div className="flex w-full flex-wrap justify-center gap-3">
          {responses.map((r, i) => (
            <button key={r} disabled={busy} onClick={() => onRespond(notice, r)}
              className={`min-h-[64px] min-w-[140px] flex-1 rounded-2xl px-6 text-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 ${
                i === 0
                  ? "bg-[#ffc400] text-[#0a0a0a]"
                  : "border border-white/[0.12] bg-[#0a0a0a] text-[#fafafa]"
              }`}>
              {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
