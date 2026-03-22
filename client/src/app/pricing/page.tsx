import type { Metadata } from "next";
import Header1 from "@/components/mvpblocks/header-1";
import SimplePricing from "@/components/mvpblocks/simple-pricing";
import Footer4Col from "@/components/mvpblocks/footer-4col";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Explore ABjee Travel pricing plans and choose the best option for your needs.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "ABjee Travel | Pricing",
    description: "Explore ABjee Travel pricing plans and choose the best option for your needs.",
    url: "/pricing",
    type: "website",
    images: [
      {
        url: "/logo.jpg",
        width: 1200,
        height: 630,
        alt: "ABjee Travel Pricing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ABjee Travel | Pricing",
    description: "Explore ABjee Travel pricing plans and choose the best option for your needs.",
    images: ["/logo.jpg"],
  },
};

export default function PricingPage() {
  return (
    <main className="overflow-x-clip">
      <Header1 />
      <div className="pt-16 lg:pt-20" />
      <SimplePricing />
      <Footer4Col />
    </main>
  );
}
