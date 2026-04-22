# Redis Versioned Cache System - Visual Guide

## 1. Cache Key Structure

```
┌─────────────────────────────────────────────────────────┐
│ places:v{version}:{search}:{location}:{status}:page:{n} │
└─────────────────────────────────────────────────────────┘
   ▲         ▲          ▲          ▲       ▲      ▲
   │         │          │          │       │      └─ Page number (1, 2, 3...)
   │         │          │          │       └─ Status (active/inactive/all)
   │         │          │          └─ Location filter (normalized lowercase)
   │         │          └─ Search term (normalized lowercase)
   │         └─ Version from Redis key `places:version`
   └─ Cache prefix
```

### Examples
```
places:v1:goa:all:all:page:1          ← Search: "goa", Location: none, Status: all, Page: 1
places:v1:darjeeling:bengal:active:page:2  ← Search: "darjeeling", Location: "bengal", Status: active, Page: 2
places:v2:all:maharashtra:all:page:1      ← No search, Location: "maharashtra", Status: all, Page: 1
```

---

## 2. Request Flow Diagram

### First Request (Cache Miss)
```
┌─ Admin requests: GET /api/admin/tourist-places/list?search=goa
│
├─ Server: Build cache key "places:v1:goa:all:all:scan"
│
├─ Redis: Check if key exists
│  └─ NOT FOUND (first time)
│
├─ Firestore: Run expensive scan
│  ├─ Scan page 1 → Find 25 matches
│  ├─ Scan page 2 → Find 18 matches
│  └─ ... (continue scanning)
│  └─ Total: 245 matching places
│
├─ Redis: Cache the results
│  └─ SETEX "places:v1:goa:all:all:scan" 120 [245 items]
│
└─ Return: First 30 items + cacheStatus: "miss"
   ⏱️  Time: 500-1000ms (Firestore scan)
```

### Second Request (Cache Hit)
```
┌─ Admin requests: GET /api/admin/tourist-places/list?search=goa&page=2
│
├─ Server: Build cache key "places:v1:goa:all:all:scan"
│
├─ Redis: Check if key exists
│  └─ FOUND! [245 cached items]
│
├─ Slice cached items
│  └─ items[30:60] = page 2 results
│
└─ Return: Page 2 items + cacheStatus: "hit"
   ⏱️  Time: 5-10ms (Redis lookup)
   ✅ 50-100x FASTER!
```

---

## 3. Version Invalidation Flow

### When Admin Creates/Updates/Deletes
```
Admin Action
    │
    ├─ Write to Firestore
    │  └─ Create/Update/Delete document
    │
    ├─ Call: invalidateCacheVersion()
    │  └─ Redis: INCR places:version
    │     places:version: 1 → 2
    │
    ├─ Old Cache Keys Now Stale
    │  ├─ places:v1:goa:all:all:scan  ← STALE (version mismatch)
    │  ├─ places:v1:all:all:all:page:1  ← STALE
    │  └─ places:v1:darjeeling:all:all:scan  ← STALE
    │
    └─ Next Request Uses New Version
       └─ Key: places:v2:goa:all:all:scan
          └─ Cache miss → Fetch fresh → Cache with v2
```

---

## 4. Performance Comparison

### Scenario A: Repeated Non-Filtered Pagination

**Before (No Cache):**
```
Request: Page 1 → Firestore read (100ms)
Request: Page 2 → Firestore read (100ms)
Request: Page 3 → Firestore read (100ms)
Total: 300ms, 3 Firestore reads
```

**After (Page Cache):**
```
Request: Page 1 → Firestore read (100ms) + Cache miss
Request: Page 2 → Redis hit (5ms)
Request: Page 3 → Redis hit (5ms)
Total: 110ms, 1 Firestore read ✅ 3x faster, 66% fewer reads
```

### Scenario B: Filtered Search with Multiple Pages

**Before (No Cache):**
```
Request: Filter "Goa", Page 1 → Scan 20 pages (1000ms)
Request: Filter "Goa", Page 2 → Scan 20 pages (1000ms)
Request: Filter "Goa", Page 3 → Scan 20 pages (1000ms)
Total: 3000ms, 60 Firestore reads, 3 expensive scans
```

**After (Scan Cache):**
```
Request: Filter "Goa", Page 1 → Scan 20 pages (1000ms) + Scan cache miss
Request: Filter "Goa", Page 2 → Redis hit (5ms)
Request: Filter "Goa", Page 3 → Redis hit (5ms)
Total: 1010ms, 20 Firestore reads, 1 scan ✅ 3x faster, 95% fewer reads!
```

---

## 5. Cache Management Timeline

```
Time: 0s   - Admin: "Filter Goa" → Firestore scan → Cache miss
           - Redis: SET v1:goa:all:all:scan [245 items] (TTL: 120s)

Time: 5s   - Admin: "Page 2 of Goa" → Redis hit ✅
Time: 10s  - Admin: "Page 3 of Goa" → Redis hit ✅
Time: 30s  - Admin: "Load more" → Redis hit ✅

Time: 90s  - Admin edits a place
           - Redis: INCR places:version (1 → 2)
           - Old cache: STALE (v1:goa:all:all:scan)

Time: 95s  - Admin: "Filter Goa again" → Cache miss (version 2)
           - Firestore: Fresh scan
           - Redis: SET v2:goa:all:all:scan [updated items]

Time: 150s - Old v1 cache keys expire automatically
           - Redis TTL: 120s → 0 TTL
```

---

## 6. State Machine: Cache Lifecycle

```
                              ┌──────────────────────┐
                              │   NO CACHE (Empty)   │
                              └──────────┬───────────┘
                                        │
                                        │ First request
                                        │ (page 1, filter X)
                                        ▼
                              ┌──────────────────────┐
                              │   Cache Miss (-f)    │
                              │ Fetch from Firestore │◄──────────┐
                              │ Store in Redis       │           │
                              └──────────┬───────────┘           │
                                        │                        │
                                        │ Stored                 │
                                        ▼                        │
                              ┌──────────────────────┐           │
                         ┌───►│   Cache Hit (✓)      │           │
                         │    │ Serve from Redis     │           │
                         │    │ <5ms latency         │           │
                         │    └──────────┬───────────┘           │
                         │              │                        │
                         │              │ Repeated requests     │
                         │              │ Same filter           │
                         │              └──────────────────┐   │
                         │                                 │   │
                         │              ┌──────────────────▼──┐│
                         │              │ Admin edit occurs    ││
                         │              │ INCR places:version  ││
                         │              └──────────┬───────────┘│
                         │                         │            │
                         │                         │ New version│
                         │                         ▼            │
                         │              ┌──────────────────────┘
                         │              │
                         │              ├─ TTL expires (90-120s)
                         │              │
                         └──────────────┘

Legend:
(-f)  = Cache miss, fetch from source
(✓)  = Cache hit, serve from cache
```

---

## 7. API Response Structure

### Successful Cache Hit
```json
{
  "rows": [
    { "id": "place1", "name": "Goa Beach", ... },
    { "id": "place2", "name": "Goa Fort", ... }
  ],
  "hasMore": true,
  "nextCursor": "2",
  "cacheStatus": "hit",        ✅ Served from Redis
  "scanCacheHit": true         ✅ Scan results cached
}
```

### Successful Cache Miss
```json
{
  "rows": [
    { "id": "place1", "name": "Goa Beach", ... },
    { "id": "place2", "name": "Goa Fort", ... }
  ],
  "hasMore": true,
  "nextCursor": "2",
  "cacheStatus": "miss",       ❌ Fetched from Firestore
  "scanCacheHit": false        ❌ Had to scan
}
```

---

## 8. Integration Points

```
User Action               API Endpoint              Cache Key
───────────────────────────────────────────────────────────────

Browse page 1        →  /admin/tourist-places/list
                         ?page=1&search=&location=
                        Cache: places:v1:all:all:all:page:1

Browse page 2        →  /admin/tourist-places/list
                         ?page=2&search=&location=
                        Cache: places:v1:all:all:all:page:2

Filter "Goa"         →  /admin/tourist-places/list
                         ?page=1&search=goa&location=
                        Cache: places:v1:goa:all:all:scan
                        Then slice for page 1

Edit a place         →  PUT /admin/tourist-places?id=X
                        Action: INCR places:version (1→2)
                        Result: All v1:* cache keys stale

Refresh after edit   →  /admin/tourist-places/list
                         ?page=1&search=goa&location=
                        Cache: places:v2:goa:all:all:scan (miss)
                        Fetches fresh data
```

---

## 9. Redis Command Reference

### Setup/Check
```redis
GET places:version          # Current version (defaults to 1)
PING                        # Test connection
```

### On Cache Hit
```redis
GET places:v1:goa:all:all:scan    # Retrieve cached items
TTL places:v1:goa:all:all:scan    # Check remaining TTL
```

### On Cache Miss
```redis
SETEX places:v1:goa:all:all:scan 120 "[JSON items]"  # Cache with 120s TTL
```

### On Admin Edit
```redis
INCR places:version    # Increment version (1 → 2)
                       # Old keys now stale
```

### Cleanup (Automatic)
```redis
# After 90-120 seconds, expired keys auto-deleted
# Manual cleanup not needed
```

---

## 10. Troubleshooting Decision Tree

```
Is admin seeing slow load times?
│
├─ Check cacheStatus in API response
│  │
│  ├─ "miss" → Normal first request, should be cached next time
│  │
│  └─ "hit" but still slow?
│     └─ Check network latency, Redis connection
│
├─ Are filters changing frequently?
│  └─ New filter = new cache key = cache miss
│
├─ Is TTL expiring too fast?
│  └─ Adjust CACHE_TTL_SECONDS in cacheVersioned.ts
│
└─ Is Redis not connected?
   └─ Check env vars, Test Redis button in System Status
```

---

## Summary

✅ **Versioned keys** ensure no stale data even with TTL
✅ **Scan cache** prevents repeated heavy Firestore scans  
✅ **Page cache** enables instant page navigation
✅ **Automatic invalidation** on admin edits (version increment)
✅ **Graceful fallback** if Redis unavailable (falls back to Firestore)

