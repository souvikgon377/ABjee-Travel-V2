export const buildAbjeeShareText = ({
  title,
  location,
  url,
}: {
  title: string;
  location?: string;
  url: string;
}) => {
  const cleanTitle = title.trim();
  const cleanLocation = location?.trim();
  const headline = `Check out ${cleanTitle}${cleanLocation ? ` (${cleanLocation})` : ''} on ABjee Travel.`;
  return `${headline} ${url}`;
};
