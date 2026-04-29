# Tourist Place Search Architecture Report

## Executive Summary

The ABjee Travel application implements **two distinct search architectures** for tourist places:

1. **User-Side Search**: Lightweight, fast, public-facing search optimized for discovery
2. **Admin-Side Search**: Feature-rich, protected, admin-only search with filtering and caching

This report details both systems, their differences, fallback mechanisms, and how they interact with Redis and Firebase.

---

## Part 1: User-Side Tourist Place Search

### Overview

The user-side search is designed for **public discovery** of tourist places with emphasis on speed and simplicity.

**Entry Point**: `POST /api/tour-places/search`

**Response Type**: Paginated results with 12 items per page default

### Architecture Diagram

```
User Client
    ↓
POST /api/tour-places/search
    ↓
Normalize query (lowercase, remove special chars)
    ↓
Check for empty/trivial query
    ├─ Yes → Return full dataset (12 items per page)
    └─ No → Proceed to search
    ↓
Try searchPlaces() with Redis index
    ├─ Hit (data found) → Return results
    └─ Miss (no data) → Fallback to fuzzy search
    ↓
performFuzzySearch() on sharedPlacesCache
    ↓
Return paginated results
```

### Request Parameters

```typescript
{
  query?: string;        // Search term (e.g., "Kolkata")
  page?: number;         // Page number (1-indexed)
}
```

### Response Structure

```typescript
{
  results: TouristPlace[];
  hasMore: boolean;
  totalCount: number;
  searchTerm: string;
  page: number;
  searchMethod: 'index' | 'fuzzy' | 'all'
}
```

### Search Methods

#### Method 1: Index Search (searchPlaces)

**Location**: `src/lib/server/touristSearchUtils.ts`

**How it works:**
1. Normalizes search query (lowercase, removes special chars)
2. Queries Redis prefix indexes (`idx:prefix:location_lower`, `idx:prefix:name_lower`)
3. Intersects token indices (`idx:token:*`) if multiple words provided
4. Returns sorted results by `updatedAt`

**Caching**:
- **Cache Hit**: 40 seconds TTL for valid results
- **Cache Miss**: 10 seconds TTL (negative caching)
- **Storage**: Redis with prefix-based indexing

**Example Query**:
- User searches: "Kolkata"
- Normalized: "kolkata"
- Queries: `idx:prefix:location_lower:k`, then `idx:prefix:location_lower:ko`, etc.
- Returns: All places with "kolkata" in location fields

#### Method 2: Fuzzy Search (performFuzzySearch)

**When Used**: When Redis index returns no results

**How it works:**
1. Loads full dataset from `getSharedPlacesCache()`
2. Performs client-side fuzzy matching on place names
3. Scores results based on match quality
4. Returns top matches

**Characteristics**:
- More forgiving (typos, partial matches acceptable)
- In-memory operation (no network latency)
- Best for: Exploratory queries, misspellings

#### Method 3: Full Dataset (All Places)

**When Used**: When no search query provided

**How it works:**
1. Fetches entire cached dataset
2. Sorts by `updatedAt` (newest first)
3. Paginates with 12 items per page

**Performance**:
- Cold load: ~50ms (Upstash Redis)
- Cached load: <5ms
- Dataset size: 200-300 places typical

### Cache Layers

| Layer | Storage | TTL | Use Case |
|-------|---------|-----|----------|
| L1 | In-Memory (Node.js) | 2-5 min | Hot queries |
| L2 | Redis (Upstash) | 5-24 hours | Persistent index |
| L3 | Firestore | Permanent | Source of truth |

### Pagination

- **Default page size**: 12 items
- **Max page**: 50 (limited by Firestore query)
- **Navigation**: Page-based (not cursor-based)

**Example**:
```
Page 1: Items 1-12
Page 2: Items 13-24
Page 3: Items 25-36
```

### No Fallback During Quota Errors

**⚠️ CRITICAL ISSUE**: When Redis hits Upstash free tier quota limits:
- User search returns errors (not gracefully handled)
- Falls back to fuzzy search but may timeout
- **Solution**: Implement 3-tier fallback like admin search

---

## Part 2: Admin-Side Tourist Place Search

### Overview

The admin-side search is designed for **management and curation** with advanced filtering, rate limiting, and robust fallback mechanisms.

**Entry Point**: `GET /api/admin/tourist-places/list`

**Protected By**: Admin authentication required

**Rate Limited**: 20 requests per 10 seconds per IP

### Architecture Diagram

```
Admin Client (authenticated)
    ↓
GET /api/admin/tourist-places/list
    ↓
Validate auth token & admin role
    ↓
Extract: search, location, filter, page, limit
    ↓
Guard: Short-circuit trivial queries
    ├─ Search length 1 char → Return empty
    ├─ Location length 1 char → Return empty
    └─ Proceed if valid
    ↓
Try adminSearch() with Redis
    ├─ Success → Return results
    └─ Error (quota, network, etc.) → Catch & continue
    ↓
Fallback: fallbackFirestoreSearch()
    ├─ Fetch from Firestore collection
    ├─ Filter in-memory by search/location/status
    ├─ Paginate results
    └─ Return with source='firestore-fallback'
    ↓
Log result metrics
    ↓
Return to client
```

### Request Parameters

```typescript
GET /api/admin/tourist-places/list?
  search=kolkata&
  location=&
  filter=all&
  page=1&
  limit=30
```

| Parameter | Type | Required | Default | Range |
|-----------|------|----------|---------|-------|
| `search` | string | No | "" | Any |
| `location` | string | No | "" | Any |
| `filter` | string | No | "all" | "all", "photos-added", "photos-not-added" |
| `page` | number | No | 1 | 1-50 |
| `limit` | number | No | 30 | 20-50 |

### Response Structure

```typescript
{
  data: TouristPlace[];
  rows: TouristPlace[];
  total: number;
  totalCount: number;
  page: number;
  hasMore: boolean;
  source: 'redis' | 'snapshot' | 'firestore-fallback' | 'fallback-error';
  cacheStatus: 'hit' | 'miss' | 'error';
  queryName: string;
  docsReturned: number;
  latencyMs: number;
}
```

### Search Flow: adminSearch()

**Location**: `src/lib/server/touristSearchUtils.ts` (260+ lines)

**Multi-Stage Approach**:

#### Stage 1: Redis Index Query
```
Search term: "kolkata"
    ↓
1. Try idx:prefix:location_lower (highest priority)
2. Try idx:prefix:name_lower
3. Try idx:token:* (if multi-word)
4. Try generic prefix fallback
5. Try all IDs fallback
    ↓
Result: Set of place IDs
    ↓
Fetch full documents from place:* cache
    ↓
Apply filters (photos-added, etc.)
    ↓
Paginate & return
```

**Cache Behavior**:
- **Hit (40s TTL)**: Results cached at query-level
- **Miss (10s TTL)**: Negative result cached
- **Error**: Returns in-memory snapshot (up to 50 items)

#### Stage 2: In-Memory Snapshot Fallback
```
When Redis connection fails:
    ↓
Load getInMemorySnapshot() (cached dataset)
    ↓
Check age: if > 1 hour → log warning
    ↓
Return first 50 results (max)
    ↓
Note: Limited! Does not fetch full dataset
```

#### Stage 3: Firestore Fallback (When Redis times out)
```
Collection: 'touristPlaces'
    ↓
orderBy('updatedAt', 'desc')
    ↓
limit(2000)
    ↓
Apply filters:
  - Search: Check name, area, city, state, country
  - Location: Multi-field search
  - Status: photos-added, photos-not-added
    ↓
Slice pagination (in-memory)
    ↓
Return with latencyMs
```

### Firestore Fallback Implementation

**Function**: `fallbackFirestoreSearch()`

**Key Code**:
```typescript
const snap = await adminDb
  .collection('touristPlaces')
  .orderBy('updatedAt', 'desc')
  .limit(2000)
  .get();

let places = snap.docs.map(doc => ({
  id: doc.id,
  ...(doc.data() as Record<string, unknown>)
}));

// In-memory filtering
if (params.search) {
  const searchLower = params.search.toLowerCase();
  places = places.filter((p: any) => {
    const searchable = [
      p.name, p.Name, p.area, p.Area,
      p.city, p.City, p.state, p.State,
      p.country, p.Country,
      p.name_lower, p.location_lower,
      p.location_search,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return searchable.includes(searchLower);
  });
}
```

**Challenges**:
- Loads **2000 documents** to handle larger datasets
- Filters entirely in-memory (CPU intensive)
- Susceptible to Firestore quota errors
- **Currently returning 0 results** due to possible field name mismatches

### Advanced Features

#### Filtering

**Photos-Added Filter**:
- Checks for `coverImage` OR media array
- Matches places with images or videos

**Photos-Not-Added Filter**:
- Excludes places with media
- Useful for content curation

**All Filter**:
- No additional filtering
- Returns all matching search results

#### Rate Limiting

**Implementation**:
```typescript
if (search && results.hits < 1) {
  // Log zero-result queries for analytics
  await recordAnalytics({
    searchTerm: search,
    resultCount: 0,
    timestamp: Date.now(),
  });
}
```

**Limits**:
- 20 requests per 10 seconds per IP
- Enforced at route handler level
- Prevents abuse of admin dashboard

#### Client IP Detection

```typescript
function getClientIP(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||     // Cloudflare
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||  // Proxy
    req.headers.get("x-real-ip") ||             // Nginx
    req.ip ||                                    // Node.js
    "unknown"
  );
}
```

### Search Field Normalization

**Applied during indexing**:
```typescript
const normalizeSearchField = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
```

**Creates searchable fields**:
- `name_lower`: Normalized place name
- `location_lower`: Normalized area + city + state + country
- `location_search`: Alternative location format

---

## Part 3: Comparative Analysis

### User vs Admin Search

| Feature | User Search | Admin Search |
|---------|-------------|--------------|
| **Entry Point** | `/api/tour-places/search` | `/api/admin/tourist-places/list` |
| **Authentication** | None | Admin only |
| **Rate Limiting** | None | 20 req/10s per IP |
| **Filtering** | None | photos-added, photos-not-added |
| **Page Size** | 12 items fixed | 20-50 items configurable |
| **Cache TTL** | 40s (hit), 10s (miss) | 40s (hit), 10s (miss) |
| **Fallback 1** | Fuzzy search | In-memory snapshot |
| **Fallback 2** | None | Firestore query |
| **Max Results** | 12 per page | 2000+ per fallback |
| **Search Methods** | 6 Redis strategies | 6 Redis strategies |
| **Analytics** | None | Zero-result queries logged |
| **Sorting** | By updatedAt | By updatedAt (admin can control) |
| **Pagination** | Page-based (simple) | Page-based (with hasMores) |

### Indexing Strategy Comparison

**User Side**:
- Relies on `sharedPlacesCache` (in-memory snapshot)
- **No active indexing** (uses what admin created)
- Falls back to fuzzy search immediately

**Admin Side**:
- Uses `fullIndexPlaces()` for Redis re-indexing
- Implements **double-buffer swap** (atomic index updates)
- Maintains registry of all index keys
- Auto-reindex on create/update/delete

**Indexing Features**:
```
Full Index Build:
├─ Phase 1: Double-Buffer Build (tmp:idx:*)
├─ Phase 2: Sanity Check (min 10% of last known size)
├─ Phase 3: Atomic Swap (RENAMENX for each key)
├─ Phase 4: Finalize (update version, cleanup)
└─ Backoff: 30s cooldown + exponential backoff on failures
```

---

## Part 4: Current Issues & Observations

### Issue 1: Redis Quota Errors (Critical)

**Problem**: 
- Free tier Upstash limit: 500K requests/month
- When exceeded: All Redis operations fail
- User-side: Returns errors (no fallback)
- Admin-side: Falls back to Firestore (but returns 0 results)

**Root Cause**: Firestore fallback likely querying wrong collection or fields.

**Impact**:
- Admin dashboard unable to search when Redis unavailable
- Users unable to discover places

**Solution**:
- Implement proper Redis quota detection
- Trigger early fallback before operations fail
- Increase quota or implement rate limiting

### Issue 2: Firestore Fallback Returns 0 Results

**Problem**: Admin fallback successfully calls Firestore but returns empty result set

**Suspected Causes**:
1. Collection name mismatch (looking for 'touristPlaces', might be 'tourist_places')
2. Field names don't match Firestore schema (case sensitivity)
3. Complex filter logic blocking all results
4. Firestore quota/permission errors (silently caught)

**Evidence**:
```
[AdminSearchRoute] Redis unavailable, falling back to Firestore query
[AdminSearchRoute] RESULT: docsReturned: 0
```

**Next Steps**:
1. Log the actual Firestore documents returned before filtering
2. Verify field names in Firestore match those in code
3. Add detailed error logging in fallback function
4. Test with explicit queries in Firebase console

### Issue 3: No Real-Time Indexing

**Problem**: Search indices don't update immediately after create/update/delete

**Current Flow**:
1. Document written to Firestore
2. `invalidateCacheVersion()` called (clears version)
3. Index update async (may not complete immediately)
4. User searches may hit stale index

**Impact**: Admin may not see newly added places immediately in search

**Solution**:
- Implement real-time Firestore listeners
- Or: Use write-through cache pattern
- Or: Increase TTL for negative results

### Issue 4: Snapshot Fallback Limited to 50 Items

**Problem**: When Redis unavailable but before Firestore fallback is attempted, returns max 50 items

```typescript
// From adminSearch fallback
const snap = getInMemorySnapshot();
return {
  data: sorted.slice(0, Math.min(limit, 50)),
  total: snap.length,
  ...
};
```

**Impact**: Large datasets truncated during partial outages

**Solution**: Skip snapshot fallback, go directly to Firestore

---

## Part 5: Data Flow & Indexing

### How Data Enters the System

```
Create Tourist Place (Admin UI)
    ↓
POST /api/admin/tourist-places/create
    ↓
1. Write to Firestore: collection('touristPlaces').add()
    ↓
2. Update Redis cache: updateSharedPlaceInCache()
    ├─ Update in-memory snapshot
    └─ Invalidate index version
    ↓
3. Call invalidateCacheVersion()
    ├─ Increment places:version
    └─ Trigger reindex (async)
    ↓
4. Trigger fullIndexPlaces()
    ├─ Rebuild all Redis indices
    ├─ Double-buffer swap
    └─ Set idx:meta:full_indexed
    ↓
Index now ready for user queries
```

### Search Field Creation

**During Create/Update**:
```typescript
const searchFields = {
  name_lower: normalizeSearchField(place.name),
  location_search: normalizeSearchField([
    place.country, place.state, place.city, place.area
  ].filter(Boolean).join(' ')),
  location_lower: normalizeSearchField([
    place.area, place.city, place.state, place.country
  ].filter(Boolean).join(' ')),
};

// Stored in Firestore alongside document
await docRef.update({
  ...updateData,
  ...searchFields,
});
```

**Benefits**:
- Pre-normalized at write time
- No normalization during read (faster)
- Fallback searches can use same fields

---

## Part 6: Recommendations

### Short-Term (Immediate)

1. **Debug Firestore Fallback** (Priority: HIGH)
   - Add logging before/after filtering
   - Verify field names match Firestore schema
   - Test with known search terms
   - Add error tracking

2. **Implement Redis Quota Detection** (Priority: HIGH)
   - Monitor Redis available memory
   - Trigger fallback at 90% quota usage
   - Implement request rate limiting
   - Add quota alerts to admin dashboard

3. **Implement User-Side Fallback** (Priority: MEDIUM)
   - Add Firestore fallback to `/api/tour-places/search`
   - Use same `fallbackFirestoreSearch()` logic
   - Return graceful error message if all fallbacks fail

### Medium-Term (1-2 weeks)

1. **Improve Index Robustness**
   - Add index version tracking
   - Implement index health checks
   - Auto-repair indices if corrupted

2. **Add Real-Time Updates**
   - Implement Firestore listeners
   - Stream index updates to Redis
   - Reduce cache invalidation time

3. **Optimize Firestore Fallback**
   - Implement proper indexing in Firestore
   - Use composite indexes for multi-field searches
   - Paginate Firestore queries (avoid 2000-doc fetch)

### Long-Term (Optimization)

1. **Migrate to Upstash Tier**
   - Increase quota to Pro tier if feasible
   - Implement cost monitoring
   - Set up alerts for quota usage

2. **Alternative Caching**
   - Consider Cloudflare KV (if using Cloudflare)
   - Evaluate DynamoDB (AWS)
   - Or: Implement local caching layer

3. **Search Enhancements**
   - Implement full-text search (Elasticsearch)
   - Add relevance scoring
   - Support advanced filters (date range, etc.)

---

## Part 7: Appendix

### Key Files & Locations

| Component | File | Lines |
|-----------|------|-------|
| User search route | `api/tour-places/search/route.ts` | ~60 |
| Admin search route | `api/admin/tourist-places/list/route.ts` | ~220 |
| Search utilities | `lib/server/touristSearchUtils.ts` | ~260 |
| Create place route | `api/admin/tourist-places/create/route.ts` | ~100 |
| Update place route | `api/admin/tourist-places/route.ts` | ~150 |
| Admin UI component | `components/ui/tourist-places.tsx` | ~2100 |
| User UI component | `screens/TourPlaces.tsx` | ~1200 |

### Redis Key Patterns

```
idx:prefix:*             → Prefix index (all places)
idx:prefix:name_lower:*  → Name-specific prefix index
idx:prefix:location_lower:* → Location-specific prefix index
idx:token:*              → Token index (for multi-word queries)
idx:all_ids              → Set of all place IDs
idx:all_tokens           → Set of all indexed tokens
place:*                  → Individual place documents
search:*                 → Cached search results
places:version           → Current index version
rebuild:*               → Re-indexing metadata
```

### Firestore Collection Schema

```
Collection: touristPlaces

Document structure:
{
  id: string (doc ID)
  name: string
  area: string
  city: string
  state: string
  country: string
  description: string (HTML)
  category: string
  googleMapsUrl: string
  coverImage: string (URL)
  media: MediaItem[]
  extraInfo: InfoSection[]
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  // Search fields (added automatically)
  name_lower: string
  location_lower: string
  location_search: string
}
```

### Testing Checklist

- [ ] User search: "Kolkata" returns results
- [ ] Admin search: "Kolkata" returns results with filters
- [ ] Admin fallback: Disable Redis, verify Firestore fallback works
- [ ] Fuzzy search: User search "Kolkta" (typo) returns results
- [ ] Rate limiting: Admin >20 req/10s returns 429
- [ ] Create & search: New place appears in results within 5s
- [ ] Pagination: Page 2 returns different results than page 1
- [ ] Photos filter: Filter shows only places with images
- [ ] Empty results: "XYZ" search returns empty gracefully
- [ ] Large dataset: 500+ places searchable

---

## Conclusion

The ABjee Travel search system implements a sophisticated two-tier architecture optimized for both user discovery and admin management. While the user-side search is simple and fast, the admin-side offers robust fallback mechanisms crucial for operational reliability.

**Current state**: System functions well under normal Redis conditions but degrades when quota is exceeded.

**Critical fix needed**: Implement working Firestore fallback to ensure search availability during Redis outages.

**Future opportunity**: Integrate full-text search (Elasticsearch) for enhanced discovery and relevance ranking.

