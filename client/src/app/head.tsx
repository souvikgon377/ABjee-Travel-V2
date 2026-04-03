const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || "").trim();

const normalizeOrigin = (value: string): string | null => {
  try {
    if (!value) return null;
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const originSet = new Set<string>([
  "https://firebasestorage.googleapis.com",
  "https://www.googleapis.com",
]);

const cdnOrigin = normalizeOrigin(cdnUrl);
if (cdnOrigin) {
  originSet.add(cdnOrigin);
}

const origins = Array.from(originSet);

export default function Head() {
  return (
    <>
      {origins.map((origin) => (
        <link key={`preconnect-${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />
      ))}
      {origins.map((origin) => (
        <link key={`dns-${origin}`} rel="dns-prefetch" href={origin} />
      ))}
    </>
  );
}
