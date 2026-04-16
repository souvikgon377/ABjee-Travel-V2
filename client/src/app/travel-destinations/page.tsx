import { Metadata } from 'next';
import TravelItenaryDisplay from '../../screens/TravelItenaryDisplay';
import { publicAsset } from '@/lib/publicAsset';

const resolveImageFromSearch = (raw?: string | string[]) => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return publicAsset('/logo.jpg');
  return /^https?:\/\//i.test(value) ? value : publicAsset('/logo.jpg');
};

const resolveTextParam = (raw?: string | string[]) => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || '';
};

export function generateMetadata({
  searchParams,
}: {
  searchParams: { place?: string | string[]; img?: string | string[] };
}): Metadata {
  const place = resolveTextParam(searchParams.place);
  const image = resolveImageFromSearch(searchParams.img);
  const title = place ? `Check out ${place} on ABjee Travel` : 'Travel Destinations | ABjee Travel';
  const description = place
    ? `Check out ${place} on ABjee Travel.`
    : 'Search and explore travel destinations with curated travel information.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: [{ url: image, width: 1200, height: 630, alt: place || 'ABjee Travel destinations' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default function TravelDisplayPage() {
  return <TravelItenaryDisplay />;
}
