# Fulfill Remaining Search Audit Recommendations

This plan outlines the final steps to fully productionize the search system, as recommended in the `SEARCH_AUDIT.md` report.

## Proposed Changes

### PM2 Service Configuration
#### [NEW] [ecosystem.config.cjs](file:///d:/ABJEE%20NEW/Abjee-Travel-NextJs/client/ecosystem.config.cjs)
Create a standard PM2 ecosystem file to run both the Next.js web application and the background search-sync worker (`worker:search-sync`) robustly in production.

### Metrics & Exporters
#### [NEW] [route.ts](file:///d:/ABJEE%20NEW/Abjee-Travel-NextJs/client/src/app/api/metrics/route.ts)
Create a Prometheus metrics exporter endpoint. This will pull data from `MetricsService.getSummary()` and format it into the standard Prometheus plaintext format so external monitoring tools can scrape it.

### Browser-Facing Search Setup
#### [NEW] [route.ts](file:///d:/ABJEE%20NEW/Abjee-Travel-NextJs/client/src/app/api/search-key/route.ts)
Implement an endpoint that uses `SearchKeyService.generateScopedKey()` to vend secure, time-limited, search-only API keys to the browser, allowing for fast direct-to-Typesense queries in the future.

### Cache Management
#### [MODIFY] [route.ts](file:///d:/ABJEE%20NEW/Abjee-Travel-NextJs/client/src/app/api/places/route.ts)
#### [MODIFY] [SearchService.ts](file:///d:/ABJEE%20NEW/Abjee-Travel-NextJs/client/src/modules/search/SearchService.ts)
Add Cache Override Logic. We will add a `bypassCache` boolean to `SearchService.searchPlaces` and look for a `?bypassCache=true` or `?force=true` query parameter in the API route. This will allow admins and tests to intentionally skip L1/L2 cache and fetch fresh data from Typesense/Firestore.

## User Review Required
> [!IMPORTANT]
> - Do you want the `?bypassCache=true` flag to be completely public, or should we restrict it with an admin token check to prevent malicious actors from spamming expensive non-cached searches? For now, I will add it as public for development ease unless you specify otherwise.
> - The PM2 config will assume `npm run start` for the web server and `npm run worker:search-sync` for the background worker.

## Verification Plan
1. Send a request to `/api/metrics` and verify the Prometheus payload structure.
2. Send a request to `/api/search-key` and verify it returns a valid scoped key.
3. Call `/api/places?bypassCache=true` and verify the metrics show a cache miss and a database hit.
