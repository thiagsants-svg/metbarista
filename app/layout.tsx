import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppFrame } from "@/components/app-shell/app-frame";
import { BASE_PATH } from "@/lib/base-path";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/brand";

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
