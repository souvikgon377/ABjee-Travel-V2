Progress: inspected the UI, the admin API and the search fallback — root cause and fixes below.

Root Cause:
- What: The admin UI shows `{summary.totalCount || places.length}` (client/src/components/ui/tourist-places.tsx).
- Why: The admin list endpoint uses a paged search (default page size = 30) and the Firestore fallback intentionally caps reads to avoid full collection scans. See the admin route defaults (client/src/app/api/admin/tourist-places/list/route.ts) and the fallback read cap in the search fallback handler (client/src/modules/search/FallbackHandler.ts). Because the server fetches `(limit * page) + 1` documents for the fallback (30 + 1 = 31), the returned results/totalCount can be capped at 31 instead of the full 2141 in the DB.

Why you see 31 (short):
- Admin page size = 30 (TOURIST_PLACES_PAGE_SIZE).
- Fallback fetchLimit = (requestedLimit * page) + 1 → 31.
- The fallback returns a limited result set and sets totalCount based on the fetched candidates, so the UI shows 31.

Immediate options / fixes:
- Quick (ad-hoc): Get the full list from the admin endpoint using the unpaginated admin mode: call `/api/admin/tourist-places/list?all=true` (works only when no filters; the server applies a safety cap of 5000). This will return the full set (up to the cap). Example (admin auth required):
  - fetch example: `fetch('/api/admin/tourist-places/list?all=true')`
- Recommended: Add / use a small summary document that tracks the authoritative total (e.g., `tourPlaces_summary/metadata`) and return that count for the header — cheap and accurate. The UI already has constants referencing `tourPlaces_summary`. See client/src/components/ui/tourist-places.tsx.
- Better long-term: Keep Typesense (search index) healthy — when Typesense is used it returns accurate `totalCount` for the query (no Firestore fallback cap). Also consider exposing an admin-only fast-count endpoint that reads the summary doc or runs a counted query offline.

Would you like me to:
- 1) call or test the `?all=true` endpoint for you now (needs admin auth), or
- 2) implement a quick server endpoint to return the `tourPlaces_summary` count and update the header to use it, or
- 3) update the UI to display “showing 31 (of ~2141)” behavior (estimate) and a button to fetch full list?

Tell me which option and I’ll implement it.