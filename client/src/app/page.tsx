import type { Metadata } from "next";
import LandingPage from "@/screens/LandingPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://abjee-travel.vercel.app";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Explore the ABjee Travel community, chat rooms, trip stories, and curated itineraries for your next journey.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ABjee Travel | Plan Better Trips Together",
    description:
      "Explore the ABjee Travel community, chat rooms, trip stories, and curated itineraries for your next journey.",
    url: "/",
    type: "website",
    images: [
      {
        url: "/logo.jpg",
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
      "Explore the ABjee Travel community, chat rooms, trip stories, and curated itineraries for your next journey.",
    images: ["/logo.jpg"],
  },
};

export default function RootPage() {
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
    logo: `${siteUrl}/logo.jpg`,
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

