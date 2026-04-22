# Implementation Notes & Troubleshooting

## Files Modified

### New Files Created
- `lib/server/cacheManagement.ts` — Core cache utilities with all safeguards

### Files Updated
- `app/api/admin/tourist-places/list/route.ts` — Uses new cache system
- `app/api/admin/travel-itineraries/list/route.ts` — Uses new cache system
- `app/api/admin/tourist-places/route.ts` — Updated invalidation import
- `app/api/admin/travel-itineraries/route.ts` — Updated invalidation import

### Old Files (Deprecated)
- `lib/server/cacheVersioned.ts` — **No longer used, can be removed**

---

## Common Issues & Solutions

### Issue: "Cache hits are too low (<50%)"

**Symptoms:**
- Logs show frequent `CACHE MISS`
- Same filters hit repeatedly but don't cache

**Root Causes:**

1. **TTL too short** — Cache expired
   - Check: Are timestamps in logs >90s apart?
   - Solution: Increase `PAGE_CACHE_TTL` or `SCAN_CACHE_TTL`

2. **Filters not normalizing correctly** — Different inputs don't match
   - Check: Log shows `RAW: { name: "Delhi" }` but `NORMALIZED: { name: "delhi" }`
   - Check: Cache key includes normalized values
   - Solution: Verify `normalizeInput()` is called before cache key build

3. **forceRefresh flag enabled** — Client bypassing cache
   - Check: Request params include `forceRefresh=true`
   - Solution: Only enable `forceRefresh` on explicit "Reload" button, not auto-refresh

4. **Redis unavailable** — Falling back to Firestore
   - Check: Logs show `[Redis] ENV vars missing` or `[Cache] ... Skipped (Redis not available)`
   - Solution: Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars

---

### Issue: "Scan lock prevents legitimate requests"

**Symptoms:**
- Logs show `Scan lock held, returning empty result` frequently
- Users see empty results when searching

**Root Causes:**

1. **Lock TTL too long** — Lock expires slowly, blocks many requests
   - Check: `SCAN_LOCK_TTL = 5` seconds
   - Solution: Lock auto-expires, should be fine. Check if scan function is hanging.

2. **Scan function too slow** — Takes longer than lock TTL
   - Check: Logs show scan takes >5 seconds
   - Solution:
     - Reduce `MAX_SCAN_ROUNDS` (currently 20)
     - Reduce `MAX_CACHED_SCAN_SIZE` (currently 200)
     - Optimize Firestore indexes for filter fields
     - Add compound index: `(status, isActive, ...)`

3. **Too many concurrent requests** — All blocked by one scan
   - Check: Logs show many requests failing during one scan
   - Solution: This is intentional (don't scan multiple times). Wait briefly or return cached result.

---

### Issue: "Memory usage growing unbounded"

**Symptoms:**
- Redis memory usage: 100MB, 500MB, growing
- `redis-memory-stats` shows large unknown keys

**Root Causes:**

1. **Scan results not trimmed** — Caching entire untruncated results
   - Check: In `cacheScanResults()`, is `results.slice(0, MAX_CACHED_SCAN_SIZE)` being called?
   - Solution: Verify `cacheScanResults()` implementation trims results

2. **Cache keys not expiring** — TTL not set
   - Check: Redis keys without expiry: `redis.keys('places:*')` shows keys with no TTL
   - Solution: Verify `setInCache()` uses `{ ex: ttlSeconds }`

3. **Too many filter combinations** — Each unique filter set creates new cache
   - Check: `redis.dbsize()` shows 10,000+ keys
   - Solution: Use wildcards to clean expired keys manually, or increase TTL consolidation

---

### Issue: "Cache invalidation not working"

**Symptoms:**
- User updates a place in admin
- Another user still sees old data
- Version doesn't increment

**Root Causes:**

1. **`invalidateCacheVersion()` not called on mutation**
   - Check: PUT/DELETE endpoints call `await invalidateCacheVersion()`
   - Solution: Verify mutation endpoints have `invalidateCacheVersion()` call

2. **Version key not incremented** — Redis not updating version
   - Check: Logs show `[Cache] Version incremented to X`
   - Check: `redis.get('places:version')` returns old value
   - Solution: Verify Redis is connected and `redis.incr()` succeeds

3. **Old cache key still being used** — New version not in key
   - Check: Request uses old cache key: `places:v3:...` after version should be `v4:...`
   - Check: `buildPageCacheKey()` calls `getCacheVersion()` fresh each time
   - Solution: Ensure cache key builders call `getCacheVersion()` dynamically, not once

---

### Issue: "Typo detection not working"

**Symptoms:**
- Logs don't show `Possible casing issue` warnings
- Typos go undetected

**Root Causes:**

1. **Development mode disabled** — Debug logs suppressed
   - Check: `process.env.NODE_ENV === 'development'`
   - Check: Is app running in production mode?
   - Solution: Set `NODE_ENV=development` locally for debugging

2. **typo detection logic incomplete** — Current logic doesn't detect all typos
   - Check: `detectPossibleTypo()` only checks casing/whitespace
   - Solution: Enhance to detect common typos (e.g., "taj" vs "taj mahal" substring)

---

### Issue: "Scan cache hit but results don't match filter"

**Symptoms:**
- User searches "active" places
- Sees both active and inactive (scan cache has both)

**Root Causes:**

1. **Filter not included in scan cache key** — Different filters share same cache
   - Check: Cache key includes status: `places:v3:name:location:status:scan`
   - Check: `buildScanCacheKey()` includes all filters
   - Solution: Verify `validateAndNormalizeFilters()` normalizes `status` field

2. **Matching logic changed** — Cache was built with old filters
   - Check: Logs show scan executed with one filter set, but results don't match request filter
   - Solution: If filters or matching logic changed, manually increment version to invalidate old cache

---

## Performance Tuning

### High Cache Hit Rate (>80%)

**Already optimized if:**
- Page cache TTL: 90s
- Scan cache TTL: 120s
- Normalization working
- Lock preventing duplicate scans

**To improve further:**
1. Increase TTLs (more cache retention)
2. Pre-warm cache with common searches
3. Use Redis persistence to survive restarts

### High Scan Frequency (>1 per minute per filter)

**Indicates:**
- New filters every minute
- Users trying different searches
- TTL expiring before reuse

**To improve:**
1. Increase scan cache TTL
2. Analyze which filters are searched, optimize those
3. Consider compound indexes in Firestore

### Large Memory Usage (>10MB)

**Indicates:**
- Many concurrent filters
- Large result sets

**To optimize:**
1. Reduce `MAX_CACHED_SCAN_SIZE` (currently 200)
2. Increase TTL so fewer caches are stored
3. Implement cache eviction policy (Redis Maxmemory + LRU)

---

## Testing

### Unit Tests (Pseudocode)

```typescript
describe('normalizeInput', () => {
  it('should lowercase and trim', () => {
    expect(normalizeInput('  Delhi  ')).toBe('delhi');
    expect(normalizeInput('AGRA')).toBe('agra');
    expect(normalizeInput(undefined)).toBe('all');
  });
});

describe('buildPageCacheKey', () => {
  it('should include version and page', async () => {
    const key = await buildPageCacheKey({
      name: 'delhi',
      location: 'delhi',
      status: 'active',
      page: 2
    });
    expect(key).toMatch(/places:v\d+:delhi:delhi:active:page:2/);
  });
});

describe('executeScanWithLock', () => {
  it('should prevent concurrent scans', async () => {
    let scanCount = 0;
    const scanFn = async () => { scanCount++; return []; };

    const p1 = executeScanWithLock('key', scanFn);
    const p2 = executeScanWithLock('key', scanFn);

    const [r1, r2] = await Promise.all([p1, p2]);
    // One should be null (lock held), one should be []
    expect([r1, r2]).toContainEqual(null);
    expect(scanCount).toBe(1); // Only one actual scan
  });
});
```

### Integration Tests

```typescript
describe('List API with Cache', () => {
  it('should hit page cache on second request', async () => {
    const params = '?search=delhi&location=delhi&page=1';
    
    // First request: cache miss
    const res1 = await GET(new NextRequest(params));
    expect(res1.cacheStatus).toBe('miss');
    
    // Second request (within TTL): cache hit
    const res2 = await GET(new NextRequest(params));
    expect(res2.cacheStatus).toBe('hit');
  });

  it('should hit scan cache for page 2', async () => {
    // First request: page 1, triggers scan
    await GET(new NextRequest('?search=delhi&page=1'));
    
    // Second request: page 2, uses scan cache
    const res = await GET(new NextRequest('?search=delhi&page=2'));
    expect(res.scanCacheHit).toBe(true);
  });

  it('should invalidate cache on update', async () => {
    // Pre-load cache
    await GET(new NextRequest('?search=delhi&page=1'));
    
    // Admin updates
    await PUT(new NextRequest(updateBody));
    
    // Next request should miss cache
    const res = await GET(new NextRequest('?search=delhi&page=1'));
    expect(res.cacheStatus).toBe('miss');
  });
});
```

### Manual Testing

```bash
# Check Redis health
curl http://localhost:5000/api/admin/redis-health

# Check cache contents
redis-cli -u <UPSTASH_URL> KEYS "places:*"
redis-cli -u <UPSTASH_URL> GET "places:v1:delhi:delhi:all:page:1"

# Check version
redis-cli -u <UPSTASH_URL> GET "places:version"

# Clear cache for testing
redis-cli -u <UPSTASH_URL> DEL "places:v1:*"
```

---

## Adding New Filters

If you need to cache on a new filter (e.g., `category`):

1. **Update normalize:**
   ```typescript
   const filters = validateAndNormalizeFilters({
     name: rawSearch,
     location: rawLocation,
     status: rawStatus,
     category: rawCategory  // NEW
   });
   ```

2. **Update cache keys:**
   ```typescript
   // Old: places:v{version}:{name}:{location}:{status}:page:{page}
   // New: places:v{version}:{name}:{location}:{status}:{category}:page:{page}
   
   const pageCacheKey = await buildPageCacheKey({
     name: filters.name,
     location: filters.location,
     status: filters.status,
     category: filters.category  // NEW
   });
   ```

3. **Update filter matching:**
   ```typescript
   const matchesCategory = filters.category === 'all'
     ? true
     : place.category.toLowerCase() === filters.category;
   
   if (matchesSearch && matchesLocation && matchesStatus && matchesCategory) {
     results.push(place);
   }
   ```

4. **Increment version** to clear old caches that don't include category

---

## Extending to New Collections

To add caching for a different collection (e.g., `hotels`):

1. **Create a new version key:**
   ```typescript
   const VERSION_KEY = 'hotels:version';
   ```

2. **Create new cache functions** (or reuse with params):
   ```typescript
   export async function buildHotelPageCacheKey(params) {
     const version = await getCacheVersion('hotels:version');
     // ...
   }
   ```

3. **Create mutation endpoints** that call:
   ```typescript
   await redis.incr('hotels:version');
   ```

**Or:** Refactor to accept `collectionName` parameter for more DRY code.

---

## Monitoring & Alerts

### Key Metrics to Monitor

```typescript
// In observability/monitoring.ts
const metrics = {
  cacheHitRate: countHits / countRequests,
  scanFrequency: countScans / timePeriod,
  memoryUsage: redis.info('memory').used_memory,
  lockHeldCount: countLockHeldErrors,
  avgResponseTime: totalResponseTime / countRequests,
};

// Alert if:
if (cacheHitRate < 0.6) alert('Low cache hit rate');
if (scanFrequency > 1/60) alert('High scan frequency');
if (memoryUsage > 50_000_000) alert('Redis memory too high');
if (lockHeldCount > 10) alert('Too many lock contention');
```

### Logging Best Practices

Keep logs clean:

```typescript
// ✅ Good: Concise, structured
console.info('[Admin:Places] PAGE CACHE HIT', { page: 2, filter: 'delhi' });

// ❌ Bad: Verbose, unstructured
console.log('Request for page 2 with filters delhi and delhi and all resulted in a cache hit for the page cache key places:v3:delhi:delhi:all:page:2');
```

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate:** Disable caching by setting fake Redis URL (fallback to Firestore)
2. **Short-term:** Increase TTLs to reduce invalidation issues
3. **Medium-term:** Review logs, identify root cause
4. **Long-term:** Fix and re-deploy

To disable caching:
```bash
# In .env
UPSTASH_REDIS_REST_URL=""  # Empty = no Redis
```

---

## Summary

- ✅ All safeguards implemented
- ✅ Comprehensive logging for debugging
- ✅ Scan locks prevent stampede
- ✅ Input normalization prevents fragmentation
- ✅ Size limiting prevents memory explosion
- ✅ Graceful fallback if Redis unavailable
- ✅ Ready for production
