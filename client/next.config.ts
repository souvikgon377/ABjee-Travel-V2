// No explicit NextConfig import to avoid incompatible upstream type exports

const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || "").trim().replace(/\/+$/, "");
const useCdnPrefix = process.env.NODE_ENV === "production" && Boolean(cdnUrl);

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  generateEtags: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  typescript: { ignoreBuildErrors: true },
  assetPrefix: useCdnPrefix ? cdnUrl : "",
  crossOrigin: useCdnPrefix ? "anonymous" : undefined,
  turbopack: {},
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // Redirect legacy /community/room/:roomId paths to the canonical /chat/room/:roomId route.
  // This covers old notification links, bookmarks, and shared invite URLs created before
  // the route was moved/standardised under /chat/room/.
  async redirects() {
    return [
      {
        source: "/community/room/:roomId",
        destination: "/chat/room/:roomId",
        permanent: true, // 308 — tells browsers & crawlers the canonical URL has changed
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
