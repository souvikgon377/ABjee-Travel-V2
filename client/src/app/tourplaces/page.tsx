import type { Metadata } from "next";
import TourPlaces from "@/screens/TourPlaces";
import { publicAsset } from "@/lib/publicAsset";

const resolveImageFromSearch = (raw?: string | string[]) => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return publicAsset('/logo.jpg');
  return /^https?:\/\//i.test(value) ? value : publicAsset('/logo.jpg');
};

const resolveTextParam = (raw?: string | string[]) => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || '';
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ place?: string | string[]; img?: string | string[] }>;
}): Promise<Metadata> {
  const resolvedSearchParams = await searchParams;
  const place = resolveTextParam(resolvedSearchParams.place);
  const image = resolveImageFromSearch(resolvedSearchParams.img);
  const title = place ? `Check out ${place} on ABjee Travel` : 'Tour Places | ABjee Travel';
  const description = place
    ? `Check out ${place} on ABjee Travel.`
    : 'Discover tour places, explore highlights, and open detailed place cards on ABjee Travel.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: [{ url: image, width: 1200, height: 630, alt: place || 'ABjee Travel tour places' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default function TourPlacesRoute() {
  return <TourPlaces />;
}
