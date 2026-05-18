# Cloudflare CDN Setup 

This project is now configured to work with Cloudflare CDN using `NEXT_PUBLIC_CDN_URL` and cache headers from `next.config.ts`.

## 1) Environment variables

Set in your production environment:

```env
NEXT_PUBLIC_CDN_URL=https://cdn.yourdomain.com
NEXT_PUBLIC_R2_ASSET_BASE_URL=https://assets.yourdomain.com
```

Notes:
- `NEXT_PUBLIC_CDN_URL` is used as Next.js `assetPrefix` for `/_next/static/*` bundles.
- `NEXT_PUBLIC_R2_ASSET_BASE_URL` is used for public images/videos via `publicAsset()` helper.

## 2) Cloudflare DNS

1. Add your app domain in Cloudflare.
2. Set proxy ON (orange cloud) for:
- `yourdomain.com` (or `www`)
- `cdn.yourdomain.com` (CNAME to app host)
- `assets.yourdomain.com` (point to R2 custom domain or public endpoint)

## 3) Cloudflare Performance

Enable:
- Brotli: ON
- HTTP/3: ON
- 0-RTT: ON
- Early Hints: ON
- Auto Minify: JS, CSS, HTML
- Polish: Lossy (if acceptable) + WebP
- Mirage: ON (improves image loading on slower/mobile networks)

## 4) Cache Rules

Create rules in this order:

1. `Bypass API cache`
- If URL path matches `/api/*`
- Cache: Bypass

2. `Aggressive static cache`
- If URI path matches `/_next/static/*`
- Cache eligibility: Eligible
- Edge TTL: 1 year
- Browser TTL: Respect origin

3. `Public media cache`
- If hostname is `assets.yourdomain.com`
- Cache eligibility: Eligible
- Edge TTL: 1 year
- Browser TTL: 1 year

4. `HTML dynamic`
- If file extension is empty
- Cache eligibility: Eligible
- Edge TTL: 5 minutes
- Serve stale while revalidate: ON

## 5) Mobile + Global optimization

Recommended Cloudflare features:
- Argo Smart Routing (lower latency for global users)
- Tiered Cache (better cache hit ratio)
- Regional Tiered Cache (if available)
- APO for WordPress is not needed for this Next.js app

## 6) Verification checklist

- Open DevTools Network (desktop + mobile emulation)
- Confirm static files return `cf-cache-status: HIT` after warmup
- Confirm API routes are `BYPASS` or `DYNAMIC`
- Confirm first contentful paint improves on 3G/4G throttling

## 7) Rollback

If needed, unset `NEXT_PUBLIC_CDN_URL` and redeploy. The app will continue serving assets from the app origin.
