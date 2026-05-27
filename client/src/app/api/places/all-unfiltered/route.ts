import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';

export const runtime = 'nodejs';

/**
 * GET /api/places/all-unfiltered
 *
 * Direct listing for tourist places. Uses the shared tourist-place search
 * pipeline so it follows the same fallback behavior as admin/public search.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const search = (params.get('search') || '').trim();
    const category = params.get('category') || 'all';
    const filter = params.get('filter') || 'all';
    const forceRefresh = params.get('forceRefresh') === 'true';

    const tStart = Date.now();

    console.info('[FirestoreQuery] /api/places/all-unfiltered request', {
      page,
      limit,
      search: search || '(empty)',
      category,
      searchStrategy: 'SearchService.searchPlaces',
    });

    const result = await SearchService.searchPlaces({
      query: search,
      category,
      contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
      page,
      limit,
      forceRefresh,
      isActive: undefined,
    });

    const paginatedResults = result.results;
    const totalCount = result.totalCount;
    const hasMore = result.hasMore;
    const latency = Date.now() - tStart;

    console.info('[FirestoreResult] /api/places/all-unfiltered response', {
      totalCount,
      returned: paginatedResults.length,
      hasMore,
      latencyMs: latency,
      source: result.source,
      sampleIds: paginatedResults.slice(0, 5).map((doc: any) => doc.id),
    });

    return ok({
      rows: paginatedResults,
      results: paginatedResults,
      hasMore,
      totalCount,
      queryName: result.source,
      source: result.source,
      latencyMs: latency,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasNext: hasMore,
      },
    });
  } catch (error: any) {
    console.error('[API/Places/All-Unfiltered] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
