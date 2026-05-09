# Axios Timeout Error Fix - Summary

## Issue
**Error:** `AxiosError: timeout of 60000ms exceeded`

The Axios HTTP client was configured with a 60-second timeout for admin API endpoints, but some heavy Firestore queries were taking longer than 60 seconds to complete.

## Root Cause
1. **Client-side timeout too short**: Admin API instance had a 60-second timeout
2. **Backend query timeout too short**: Individual Firestore/RTDB queries had a 5-second timeout
3. **Heavy operations**: Admin endpoints like `/admin/stats`, `/admin/tourist-places/list`, and `/admin/travel-itineraries/list` perform multiple concurrent Firestore queries that can exceed these limits under load

## Changes Made

### 1. Client-Side Timeout Increase (`src/lib/api.ts`)
**Before:**
```typescript
const adminApiInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 60000, // 60 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**After:**
```typescript
const adminApiInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 120000, // 120 seconds for admin endpoints with heavy Firestore queries
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### 2. Backend Query Timeout Increase (`src/app/api/admin/stats/route.ts`)
**Before:**
```typescript
const SOURCE_TIMEOUT_MS = 5000; // 5 seconds per query
```

**After:**
```typescript
const SOURCE_TIMEOUT_MS = 10000; // 10 seconds per query
```

## Why These Changes Work
- **120-second timeout** provides breathing room for slow Firestore queries under normal conditions
- **10-second per-query timeout** allows each individual Firestore/RTDB query to complete even on slower backends
- **Cache-first approach** means most requests will hit Redis cache and return in <100ms

## Performance Optimization Recommendations

To prevent timeouts from occurring in the first place, implement these optimizations:

### 1. Add Pagination Limits
When fetching admin lists, ensure you're not fetching all records at once:
```typescript
// ✅ Good: Limited pagination
const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '30')));

// ❌ Avoid: Unbounded queries
await adminDb.collection('touristPlaces').get(); // Can be thousands of docs
```

### 2. Optimize Firestore Queries
- Add composite indexes for frequently filtered queries
- Use `.limit()` to fetch only needed documents
- Use `.select()` to fetch only required fields

### 3. Leverage Redis Cache More Aggressively
Current cache TTLs are good (5 min Redis, 2 min memory). Consider:
- Increasing TTL for less frequently changed data
- Adding cache warming on server startup
- Using cache on data that doesn't need real-time accuracy

### 4. Consider Incremental Loading
For list endpoints that show large datasets:
- Load first 50 items immediately
- Load remaining items on scroll/pagination
- Show cached data while refreshing in background

### 5. Monitor Slow Queries
Add timing logs to identify which queries are slowest:
```typescript
const start = Date.now();
const result = await query;
console.log(`Query took ${Date.now() - start}ms`);
```

## Testing
After deploying these changes:
1. Load the admin dashboard
2. Wait for `/admin/stats` to complete (should be <2s due to cache)
3. Force refresh with `?forceRefresh=true` - should now complete within 120s instead of timing out

## Related Endpoints
These endpoints use `adminApiInstance` and benefit from the increased timeout:
- `/admin/stats` - Dashboard statistics
- `/admin/tourist-places/list` - Tourist places management
- `/admin/travel-itineraries/list` - Travel itineraries management
- `/admin/users` - User management
- `/admin/subscriptions` - Subscription data
- `/admin/activity` - Activity logs
- `/admin/revenue` - Revenue reports
- `/admin/refresh-cache` - Cache warming

## Next Steps
1. Deploy these changes to your environment
2. Monitor admin dashboard load times
3. If timeouts persist on specific endpoints, add targeted logging to identify the slow queries
4. Implement optimization recommendations above for production-grade performance
