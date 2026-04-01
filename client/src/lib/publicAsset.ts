const r2AssetBaseUrl = (process.env.NEXT_PUBLIC_R2_ASSET_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export function publicAsset(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!r2AssetBaseUrl) return normalizedPath;
  return `${r2AssetBaseUrl}${normalizedPath}`;
}
