import type { Metadata } from "next";
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import LandingPage from "@/screens/LandingPage";
import { publicAsset } from "@/lib/publicAsset";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://abjee-travel.vercel.app";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Explore the ABjee Travel community, chat communities, trip stories, and curated itineraries for your next journey.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ABjee Travel | Plan Better Trips Together",
    description:
      "Explore the ABjee Travel community, chat communities, trip stories, and curated itineraries for your next journey.",
    url: "/",
    type: "website",
    images: [
      {
        url: publicAsset('/logo.jpg'),
        width: 1200,
        height: 630,
        alt: "ABjee Travel Home",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ABjee Travel | Plan Better Trips Together",
    description:
      "Explore the ABjee Travel community, chat communities, trip stories, and curated itineraries for your next journey.",
    images: [publicAsset('/logo.jpg')],
  },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export default async function RootPage() {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host');
    const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';

    const settingsResponse = await fetch(new URL('/api/public/settings', `${protocol}://${host}`), {
      cache: 'no-store',
    });

    const settingsPayload = await settingsResponse.json().catch(() => null);
    const homePageEnabled = settingsPayload?.success ? settingsPayload?.data?.homePageEnabled : true;

    if (homePageEnabled === false) {
      redirect('/community');
    }
  } catch (error) {
    // Re-throw Next.js redirect errors - check for digest which is how Next.js marks redirects
    if ((error as any)?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    // Fail open: if settings cannot be read, keep the home page accessible.
  }

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ABjee Travel",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/travel-destinations?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ABjee Travel",
    url: siteUrl,
    logo: publicAsset('/logo.jpg'),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <LandingPage />
    </>
  );
}

