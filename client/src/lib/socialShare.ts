export const isHttpUrl = (value?: string | null): value is string => {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
};

export const addPreviewImageToShareUrl = (shareUrl: URL, imageUrl?: string | null) => {
  if (isHttpUrl(imageUrl)) {
    shareUrl.searchParams.set('img', imageUrl.trim());
  } else {
    shareUrl.searchParams.delete('img');
  }
};

export const buildAbjeeShareText = ({
  title,
  location,
  url,
  imageUrl,
}: {
  title: string;
  location?: string;
  url: string;
  imageUrl?: string | null;
}) => {
  const cleanTitle = title.trim();
  const cleanLocation = location?.trim();
  const headline = `Check out ${cleanTitle}${cleanLocation ? ` (${cleanLocation})` : ''} on ABjee Travel.`;
  const lines = [headline, url];

  if (isHttpUrl(imageUrl)) {
    lines.push(`Preview image: ${imageUrl.trim()}`);
  }

  return lines.join('\n');
};
