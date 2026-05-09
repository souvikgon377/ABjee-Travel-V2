const r2AssetBaseUrl = (process.env.NEXT_PUBLIC_R2_ASSET_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const legacyVideoFallbacks: Record<string, string> = {
  '/video1.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  '/v1.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  '/v2.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  '/v3.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  '/v4.mp4': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
};

export function publicAsset(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!r2AssetBaseUrl) return normalizedPath;
  if (legacyVideoFallbacks[normalizedPath]) return `${r2AssetBaseUrl}${normalizedPath}`;
  return `${r2AssetBaseUrl}${normalizedPath}`;
}
