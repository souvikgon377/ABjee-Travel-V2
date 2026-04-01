# Cloudflare R2 Public Assets

This project can load public image/video assets from Cloudflare R2 by setting one environment variable.

## 1) Configure env

Add these in `.env.local`:

```env
NEXT_PUBLIC_R2_ASSET_BASE_URL=https://<your-public-r2-domain>
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET_NAME=<r2-bucket-name>
```

Notes:
- `NEXT_PUBLIC_R2_ASSET_BASE_URL` should be your public R2 domain (custom domain or `*.r2.dev`).
- Do not expose `R2_SECRET_ACCESS_KEY` in client-side code.

## 2) Upload current public media to R2

Run from `client/`:

```bash
npm run upload:r2:public
```

The script uploads image/video files from `public/` with the same object keys as local paths.
Example:
- `public/video1.mp4` -> `video1.mp4`
- `public/img1.png` -> `img1.png`

## 3) Files currently detected for migration

Images:
- `img1.png`
- `img2.png`
- `img3.png`
- `img4.png`
- `img5.png`
- `img6.jpg`
- `img7.jpg`
- `img8.jpg`
- `img9.jpg`
- `img10.jpg`
- `img11.jpg`
- `img12.jpg`
- `img13.jpg`
- `img14.jpg`
- `img15.jpg`
- `img16.jpg`
- `img17.jpg`
- `img18.jpg`
- `img19.jpg`
- `logo.jpg`
- `tirumala-temple_tirupati_1.jpg`
- `tirumala-temple_tirupati_2.jpg`
- `tirumala-temple_tirupati_3.jpg`

Videos:
- `video1.mp4`
- `v1.mp4`
- `v2.mp4`
- `v3.mp4`
- `v4.mp4`

## 4) Behavior

- If `NEXT_PUBLIC_R2_ASSET_BASE_URL` is set, media URL helpers resolve to R2 URLs.
- If it is empty, the app falls back to local `/public` paths.
