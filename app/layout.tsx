import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import "./globals.css";
import { AppFrame } from "@/components/app-shell/app-frame";
import { BASE_PATH } from "@/lib/base-path";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/brand";

/** Web Analytics site token for not9bar.com (public by design: it ships in every page) */
const CF_BEACON_TOKEN = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN || "cbd864f1527945e781d63288660acb29";

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
      <body className="min-h-full bg-background overflow-x-hidden">
        {/* Station-style header and menu on every page (the Station has its own) */}
        <AppFrame>{children}</AppFrame>
        {/* Cloudflare Web Analytics, unless "Don't count my use" is on */}
        {process.env.NODE_ENV === "production" && <AnalyticsBeacon token={CF_BEACON_TOKEN} />}
      </body>
    </html>
  );
}
