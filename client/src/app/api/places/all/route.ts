import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { CacheService } from '@/modules/cache/CacheService';
import { getSharedPlacesCache } from '@/lib/server/sharedPlacesCache';

export const runtime = 'nodejs';

/**
 * GET /api/places/all
 *
 * Public tourist place listing. Uses the shared places cache so search/category
 * variants do not re-scan Firestore.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const search = (params.get('search') || '').toLowerCase().trim();
    const category = params.get('category') || 'all';

    const tStart = Date.now();
    const cacheKey = `api:places:all:${category}:${search}`;

    console.info('[FirestoreQuery] /api/places/all request', {
      cacheKey,
      page,
      limit,
      search: search || '(empty)',
      category,
      firestoreStrategy: 'sharedPlacesCache',
    });

    const result = await CacheService.get(cacheKey, async () => {
      const { places, cacheStatus, source } = await getSharedPlacesCache();
      const allDocs = places.filter((doc: any) => doc.isActive !== false);

      let filtered = allDocs;
      if (search) {
        filtered = allDocs.filter((doc: any) => {
          const name = String(doc.name || '').toLowerCase();
          const city = String(doc.city || '').toLowerCase();
          const state = String(doc.state || '').toLowerCase();
          const country = String(doc.country || '').toLowerCase();
          const locationSearch = String(doc.location_search || doc.location_lower || '').toLowerCase();

          return (
            name.includes(search) ||
            city.includes(search) ||
            state.includes(search) ||
            country.includes(search) ||
            locationSearch.includes(search)
          );
        });
      }

      if (category && category !== 'all') {
        filtered = filtered.filter((doc: any) => doc.category === category);
      }

      console.info('[FirestoreResult] /api/places/all cache-fill', {
        cacheStatus,
        source,
        datasetCount: places.length,
        filteredCount: filtered.length,
        sampleIds: filtered.slice(0, 5).map((doc: any) => doc.id),
        firestoreReads: cacheStatus === 'warming' ? places.length : 0,
      });

      return { allDocs: filtered, cacheTime: Date.now() };
    }, 60);

    const filtered = result.allDocs;
    const totalCount = filtered.length;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const paginatedResults = filtered.slice(startIdx, endIdx);
    const hasMore = endIdx < totalCount;
    const latency = Date.now() - tStart;

    console.info('[FirestoreResult] /api/places/all response', {
      totalCount,
      returned: paginatedResults.length,
      hasMore,
      latencyMs: latency,
      sampleIds: paginatedResults.slice(0, 5).map((doc: any) => doc.id),
    });

    return ok({
      success: true,
      data: {
        rows: paginatedResults,
        results: paginatedResults,
        hasMore,
        totalCount,
        queryName: 'firestore_all',
        source: 'firestore_all',
        latencyMs: latency,
        pagination: {
          page,
          limit,
          total: totalCount,
          hasNext: hasMore,
        },
      },
    });
  } catch (error: any) {
    console.error('[API/Places/All] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
