# Firestore Search Remediation Report

Date: 2026-04-24

## Objective
Fix production search correctness by:
- Backfilling missing name_lower and location_lower fields.
- Adding runtime fallback logic in places API when name prefix misses.

## Changes Applied

1. Added full backfill utility.
- File: scripts/backfill-tourist-places-search-fields.mjs
- Behavior:
  - Scans touristPlaces in document-id order.
  - Computes normalized name_lower and location_lower.
  - Updates only documents where values differ.
  - Commits in batches of 300.

2. Added npm script for backfill.
- File: package.json
- Script:
  - backfill:tourist-places:search-fields

3. Updated places API to support logical fallback.
- File: src/app/api/places/route.ts
- Behavior:
  - If search term is provided, query name_lower first.
  - If empty and no explicit location param, fallback to location_lower.
  - Tracks aggregated docsRead across fallback attempts.

4. Added verification utilities.
- scripts/audit-missing-search-fields.mjs
  - Reports total docs and missing normalized fields.
- scripts/verify-places-search-fallback.mjs
  - Simulates name-first + location fallback query behavior.
- scripts/find-location-fallback-term.mjs
  - Finds a term that has location_lower hits and name_lower misses.

## Execution Evidence

### A) Backfill run
Command:
- npm run backfill:tourist-places:search-fields

Output summary:
- scanned: 1268
- updated: 1268
- status: done

### B) Post-backfill audit
Command:
- node scripts/audit-missing-search-fields.mjs

Output summary:
- total: 1268
- missingNameLower: 0
- missingLocationLower: 0
- inactive: 0

### C) Search behavior checks
1) Fallback case discovered:
- term: vadodara
- nameCount: 0
- locationCount: 1

2) Fallback verifier:
- node scripts/verify-places-search-fallback.mjs --search vadodara --limit 5
- queryName: fallback:location_lower
- docsRead: 1
- docsReturned: 1

3) Direct name-prefix hit sample:
- node scripts/verify-places-search-fallback.mjs --search goa --limit 5
- queryName: prefix:name_lower
- docsRead: 1
- docsReturned: 1

## Risk Notes

- Search correctness issue from missing normalized fields is resolved for current dataset.
- If bulk imports bypass create/update APIs, backfill should be rerun or integrated into import pipeline.

## Recommended Operational Follow-up

1. Run backfill in staging/prod post-deploy if datasets differ.
2. Add a periodic audit (daily/weekly) for missing name_lower/location_lower.
3. Consider moving from offset pagination to cursor pagination in places API for long-page read efficiency.

## Tightening Pass (Production Cost Hardening)

### 1) Offset leak removed in public places API
- File: src/app/api/places/route.ts
- Change:
  - Added cursor support via query param cursor.
  - Query now uses startAfter(cursorDoc) when cursor is present.
  - Legacy page-based pagination handling was removed from the public path.
- Effect:
  - Cursor clients get near-constant read behavior per page instead of offset growth.

### 2) Heuristic routing to reduce fallback double-reads
- File: src/app/api/places/route.ts
- Change:
  - Added explicit routing rules:
    - single-token terms that look location-like query location_lower first
    - multi-word terms stay on name_lower first
    - fallback to the alternate field only if needed
- Effect:
  - Reduces unnecessary name-first misses for location-like user input.

### 3) Public client switched to cursor pagination
- File: src/screens/TourPlaces.tsx
- Change:
  - Search requests now send cursor instead of page for load-more requests.
- Effect:
  - Public search path now benefits from cursor-based read profile.

### 4) Firestore index versioning committed to repo
- Files:
  - ../firestore.indexes.json
  - ../firebase.json
- Change:
  - Added versioned Firestore index config and wired into Firebase config.
- Effect:
  - Index definitions are now reproducible and deployable from code.

### 5) Public limit cap hardened to 20
- File: src/app/api/places/route.ts
- Change:
  - limit is now clamped to a strict maximum of 20 with a sane default of 20.
- Effect:
  - Public query payloads cannot exceed the intended result window.

## Final State Summary

- Data correctness: fixed (name_lower/location_lower fully backfilled).
- Query correctness: fixed (name/location fallback plus heuristic routing).
- Read profile: improved (cursor-only public pagination and public max limit capped at 20).
- Deployment safety: improved (Firestore indexes committed and wired).
