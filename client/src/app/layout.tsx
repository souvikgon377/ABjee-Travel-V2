import type { Metadata } from "next";
import type { Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";
import { publicAsset } from "@/lib/publicAsset";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://abjee-travel.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ABjee Travel | Plan Better Trips Together",
    template: "%s | ABjee Travel",
  },
  description:
    "ABjee Travel helps you discover destinations, collaborate in chat communities, explore travel stories, and plan complete itineraries.",
  applicationName: "ABjee Travel",
  keywords: [
    "travel planning",
    "trip itinerary",
    "chat communities",
    "travel stories",
    "group travel",
    "destination guides",
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "ABjee Travel | Plan Better Trips Together",
    description:
      "Discover destinations, collaborate in live community chat, and build complete itineraries with ABjee Travel.",
    siteName: "ABjee Travel",
    images: [
      {
        url: publicAsset('/logo.jpg'),
        width: 1200,
        height: 630,
        alt: "ABjee Travel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ABjee Travel | Plan Better Trips Together",
    description:
      "Discover destinations, collaborate in live community chat, and build complete itineraries with ABjee Travel.",
    images: [publicAsset('/logo.jpg')],
  },
  manifest: "/manifest.json",
  icons: { icon: publicAsset('/logo.jpg'), apple: publicAsset('/logo.jpg') },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f43f5e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const showSpeedInsights = process.env.NODE_ENV === "production";

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <Providers>
          {children}
          {showSpeedInsights ? <SpeedInsights /> : null}
        </Providers>
      </body>
    </html>
  );
}
