"use client";
import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { APP_NAME } from "@/lib/brand";
import { ConnectionDot } from "./connection-dot";

/**
 * Lightweight mobile top bar — shown only on mobile (md: hidden).
 * Displays the Not Nine Bar mark + connection dot without full navbar.
 * Desktop uses the full Navbar component instead.
 */
export function MobileHeader() {
  return (
    <header className="md:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-12 bg-[#111]/90 backdrop-blur-xl border-b border-white/[0.06]">
      <Link href="/" className="flex items-center gap-2 group">
        <BrandMark className="h-6 w-6" />
        <span className="font-semibold text-sm text-[#fafafa] tracking-tight">{APP_NAME}</span>
      </Link>
      <ConnectionDot />
    </header>
  );
}
