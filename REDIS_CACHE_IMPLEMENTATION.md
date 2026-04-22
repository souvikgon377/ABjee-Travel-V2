# Redis Versioned Cache System Implementation

## Overview

A comprehensive Redis-based caching layer with version-based automatic invalidation has been implemented for both **Tourist Places** and **Travel Itineraries** admin dashboards. This system significantly reduces Firestore reads while ensuring fresh data after admin updates.

---

## Architecture

### 1. **Redis Client** (`lib/server/redis.ts`)
- Initializes Upstash Redis safely
- Graceful fallback if Redis env vars are missing
- Returns `null` if Redis is unavailable (system continues without cache)

### 2. **Versioned Cache Manager** (`lib/server/cacheVersioned.ts`)
- Global version key: `places:version`
- Automatically increments on admin create/update/delete
- All cache keys include version: `places:v{version}:{filters}:page:{page}`
- Two caching strategies:
  - **Page Cache**: For paginated results (TTL: 90 seconds)
  - **Scan Cache**: For filtered results that require scanning (TTL: 120 seconds)

### 3. **Admin API Endpoints**

#### List Endpoints (Read-only)
- `/api/admin/tourist-places/list` - Cached tourist places list
- `/api/admin/travel-itineraries/list` - Cached itineraries list

**Query Parameters:**
```
- search: string (optional)
- location: string (optional, for tourist places)
- status: 'all' | 'active' | 'inactive' (for tourist places)
- country: string (optional, for itineraries)
- page: number (defaults to 1)
- limit: number (defaults to 30, max 100)
- forceRefresh: 'true' (optional, bypasses cache)
```

**Response:**
```json
{
  "rows": [...],
  "hasMore": boolean,
  "nextCursor": string | null,
  "cacheStatus": "hit" | "miss",
  "scanCacheHit": boolean
}
```

#### Mutation Endpoints (Write)
- `POST /api/admin/tourist-places/create`
- `PUT /api/admin/tourist-places?id={id}`
- `DELETE /api/admin/tourist-places?id={id}`
- `POST /api/admin/travel-itineraries/create`
- `PUT /api/admin/travel-itineraries?id={id}`
- `DELETE /api/admin/travel-itineraries?id={id}`

**All mutation endpoints automatically call `INCR places:version`** after success.

---

## Cache Flow

### For Non-Filtered Requests (Page Cache)
1. Check `places:v{version}:{filters}:page:{page}` in Redis
2. If HIT → return cached data
3. If MISS → fetch from Firestore → cache → return

**Result:** Instant response for repeated page requests

### For Filtered Requests (Scan Cache)
1. Check `places:v{version}:{search}:{location}:{status}:scan` in Redis
2. If HIT → slice cached results by page → return
3. If MISS → scan Firestore pages → collect matching results → cache scan result → slice by page → return

**Result:** Eliminates repeated heavy scans for the same filter combination

### On Admin Create/Update/Delete
1. Perform write operation
2. Call `INCR places:version` (atomically)
3. All old cache keys become invalid (version mismatch)
4. Next request automatically hits Firestore and caches with new version

**Result:** No stale data, no manual cache purging needed

---

## Caching Strategy

| Scenario | Strategy | TTL |
|----------|----------|-----|
| First page (no filters) | Page Cache | 90s |
| Page 2+ (no filters) | Page Cache | 90s |
| Filtered search | Scan Cache | 120s |
| Load More with filters | Reuse Scan Cache | 120s |
| After admin edit | New version = auto-invalidate | N/A |

---

## Log Output

The system includes detailed logging for debugging:

```
[Redis] Client initialized successfully
[Cache] Version incremented to: 2
[Admin:Places] PAGE CACHE HIT for page 1
[Admin:Places] SCAN CACHE HIT for filters: { search: 'goa', location: '', status: 'all' }
[Admin:Places] CACHE MISS - fetching from Firestore
[Admin:Places] SCAN CACHE SET for filters: { ... } items: 245
```

---

## Benefits

✅ **Reduced Firestore Reads**
- Repeated page requests: 1 read → cached
- Filtered searches: Heavy scan once → cached
- Load More with same filter: Reuses scan cache

✅ **Automatic Invalidation**
- Version increments on create/update/delete
- No wildcard deletes needed
- No TTL management complexity

✅ **Admin UX Improvements**
- Instant page navigation
- Fast filtered searches
- Fresh data after edits (zero stale cache)

✅ **Graceful Degradation**
- System works without Redis
- Falls back to Firestore on cache miss
- No breaking changes if Redis unavailable

---

## Configuration

### Environment Variables Required
```env
UPSTASH_REDIS_REST_URL=https://your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-token
```

Alternative names supported:
```env
REDIS_REST_URL=...
REDIS_REST_TOKEN=...
```

---

## Implementation Checklist

- [x] Redis client initialization (`lib/server/redis.ts`)
- [x] Versioned cache manager (`lib/server/cacheVersioned.ts`)
- [x] Tourist places list API with versioned caching
- [x] Travel itineraries list API with versioned caching
- [x] Tourist places create/update/delete with invalidation
- [x] Travel itineraries create/update/delete with invalidation
- [x] Page-based pagination (vs cursor-based)
- [x] Scan cache optimization for filtered requests
- [x] Comprehensive logging

---

## Expected Performance

### Before
- First request: 1 Firestore read (~50-100ms)
- Page 2 request: 1 Firestore read
- Filtered search: Multiple Firestore reads (scan loop)
- After edit: Still serves old cache for 5+ minutes

### After
- First request: 1 Firestore read (cache miss)
- Page 2 request: Redis lookup (~5-10ms) ✅ **10x faster**
- Filtered search: 1 Firestore scan (cache miss), then instant reuse ✅ **Scan once, use many times**
- After edit: Fresh data within 90-120s ✅ **No stale data**

---

## Notes

- Cache is NOT invalidated on migration or search index updates
- Upstash REST API used (compatible with edge functions)
- Works with Next.js App Router and server-side functions only
- Admin UI components fully compatible, no changes to visual behavior

