import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { MobileHeader } from "@/components/mobile-header";
import { BottomNav } from "@/components/bottom-nav";
import { FeedbackButton } from "@/components/feedback-button";
import { BASE_PATH } from "@/lib/base-path";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME, APP_TAGLINE, REPO_URL, SITE_URL, UPSTREAM } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} · a station for your Meticulous`,
  description: APP_TAGLINE,
  manifest: `${BASE_PATH}/manifest.json`,
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  icons: {
    apple: `${BASE_PATH}/apple-touch-icon.png`,
    icon: `${BASE_PATH}/icon-192.png`,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respect iPhone notch & home bar safe areas
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background overflow-x-hidden">
        {/* Top navbar — desktop md+ */}
        <Navbar />
        {/* Mobile header — logo + connection dot */}
        <MobileHeader />
        {/* Main content — extra bottom padding on mobile for bottom nav */}
        <main className="flex-1 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
          {children}
        </main>
        {/* Footer — desktop only */}
        <footer className="hidden md:block border-t border-white/[0.05] bg-[#0a0a0a]">
          <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-6 w-6" />
              <span className="text-sm font-semibold text-[#fafafa]/60">{APP_NAME}</span>
            </div>
            <p className="text-xs text-[#fafafa]/25 text-center">
              Based on{" "}
              <a href={UPSTREAM.repoUrl} target="_blank" rel="noopener noreferrer"
                className="text-[#fafafa]/45 hover:text-[#ffc400] transition-colors">
                {UPSTREAM.name}
              </a>{" "}
              by{" "}
              <a href={UPSTREAM.authorUrl} target="_blank" rel="noopener noreferrer"
                className="text-[#fafafa]/45 hover:text-[#ffc400] transition-colors">
                {UPSTREAM.author}
              </a>{" "}
              · MIT License · Free
            </p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-[#fafafa]/15">
                {process.env.NEXT_PUBLIC_APP_VERSION ? `v${process.env.NEXT_PUBLIC_APP_VERSION}` : ""}{" "}
                {process.env.NEXT_PUBLIC_APP_SHA ? `(${process.env.NEXT_PUBLIC_APP_SHA})` : ""}
              </span>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#fafafa]/25 hover:text-[#fafafa]/50 transition-colors">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                Source on GitHub
              </a>
            </div>
          </div>
        </footer>
        {/* Bottom nav — mobile/tablet only */}
        <BottomNav />
        {/* Feedback — visible after machine connected */}
        <FeedbackButton />
        {/* Cloudflare Web Analytics */}
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN && (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN}"}`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
