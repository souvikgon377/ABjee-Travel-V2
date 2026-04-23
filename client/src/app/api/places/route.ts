import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/server/http';
import {
filterSharedPlaces,
getSharedPlacesCache,
normalizeSharedPlacesFilters,
paginateSharedPlaces,
RedisUnavailableError,
} from '@/lib/server/sharedPlacesCache';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
try {
const params = req.nextUrl.searchParams;


// ✅ Normalize filters
const filters = normalizeSharedPlacesFilters({
  search: params.get('search') || '',
  location: params.get('location') || '',
      contentFilter: (params.get('filter') || 'all') as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
});

// ✅ Safe pagination parsing
const pageParam = Number(params.get('page'));
const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

const limitParam = Number(params.get('limit'));
const limit = Number.isFinite(limitParam)
  ? Math.max(1, Math.min(100, Math.floor(limitParam)))
  : 24;

// 🔥 Fetch from shared cache
const dataset = await getSharedPlacesCache();

// 🔒 Cache warming state (prevents duplicate Firestore hits)
if (dataset.cacheStatus === 'warming') {
  return ok(
    {
      rows: [],
      results: [],
      hasMore: false,
      lastDoc: null,
      totalCount: 0,
      cacheStatus: 'warming',
      source: dataset.source,
      retryAfter: 2,
      message: 'Cache is warming. Retry shortly.',
    },
    202
  );
}

// 🚫 Strict: no empty cache allowed
if (!dataset.places || dataset.places.length === 0) {
  return fail('Cache empty. Admin must refresh cache.', 503);
}

// ✅ In-memory filtering (NO Firestore reads)
const filtered = filterSharedPlaces(dataset.places, filters);

// ✅ Pagination
const { rows, hasMore, nextPage } = paginateSharedPlaces(
  filtered,
  page,
  limit
);

// ✅ Response
return ok({
  rows,
  results: rows,
  hasMore,
  lastDoc: nextPage ? String(nextPage) : null,
  totalCount: filtered.length,
  cacheStatus: dataset.cacheStatus,
  source: dataset.source,
  cacheSize: dataset.places.length,
});

} catch (error) {
// 🔒 Redis failure (DO NOT fallback to Firestore)
if (error instanceof RedisUnavailableError) {
return fail('Cache unavailable. Try again later.', 503);
}


const message =
  error instanceof Error ? error.message : 'Failed to load places.';

return fail(message, 500);


}
}
