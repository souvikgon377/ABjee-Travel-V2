import type { Metadata } from "next";
import TripStoriesPage from "@/screens/TripStories";
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

export function generateMetadata({
  searchParams,
}: {
  searchParams: { storyTitle?: string | string[]; img?: string | string[] };
}): Metadata {
  const storyTitle = resolveTextParam(searchParams.storyTitle);
  const image = resolveImageFromSearch(searchParams.img);
  const title = storyTitle ? `Check out ${storyTitle} on ABjee Travel` : 'Trip Stories | ABjee Travel';
  const description = storyTitle
    ? `Check out ${storyTitle} on ABjee Travel.`
    : 'Read and share authentic travel stories with photos, maps, and practical tips.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      images: [{ url: image, width: 1200, height: 630, alt: storyTitle || 'ABjee Travel trip story' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default function TripStoriesRoute() {
  return <TripStoriesPage />;
}
