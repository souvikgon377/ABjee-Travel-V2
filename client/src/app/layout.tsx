import type { Metadata } from "next";
import type { Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import { publicAsset } from "@/lib/publicAsset";
import { GetYourGuideLoader } from "@/components/integrations/getyourguide-loader";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://abjee-travel.vercel.app";
const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || "").trim();

const preconnectOrigins = Array.from(new Set([
  "https://firebasestorage.googleapis.com",
  "https://www.googleapis.com",
  "https://widget.getyourguide.com",
  "https://cdn.getyourguide.com",
  ...(() => {
    try {
      return cdnUrl ? [new URL(cdnUrl).origin] : [];
    } catch {
      return [];
    }
  })(),
]));

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
  icons: { icon: publicAsset('/bimi-logo.svg'), apple: publicAsset('/bimi-logo.svg') },
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
  const gaId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-73KFYPFXDQ";

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {preconnectOrigins.map((origin) => (
          <link key={`preconnect-${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}
        {preconnectOrigins.map((origin) => (
          <link key={`dns-${origin}`} rel="dns-prefetch" href={origin} />
        ))}
      </head>
      <body>
        <GetYourGuideLoader />
        <Providers>
          {children}
          <SpeedInsights />
        </Providers>
        
        {/* Google Analytics (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');
            gtag('config', 'AW-11019498535');
          `}
        </Script>
      </body>
    </html>
  );
}
