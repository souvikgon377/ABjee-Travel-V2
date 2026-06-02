import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { enrichTouristPlacesFromFirestore } from '@/lib/server/touristPlaceHydration';

export const runtime = 'nodejs';

/**
 * GET /api/places
 * 
 * Main tourist places endpoint. Fully powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = params.get('search') || '';
    const location = params.get('location') || '';
    const filter = params.get('filter') || 'all';
    const category = params.get('category') || 'all';
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const forceRefresh = params.get('forceRefresh') === 'true';

    const result = await SearchService.searchPlaces({
      query: search,
      location,
      category,
      contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
      page,
      limit,
      forceRefresh,
      isActive: undefined // Show all results to match admin-side behavior
    });

    const enrichedResults = await enrichTouristPlacesFromFirestore(result.results);

    // Return search results - ok() will wrap with { success: true, data: {...} }
    return ok({
      rows: enrichedResults,
      results: enrichedResults,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      queryName: result.source,
      source: result.source,
      latencyMs: result.latencyMs,
      pagination: {
        page,
        limit,
        total: result.totalCount,
        hasNext: result.hasMore
      }
    });

  } catch (error: any) {
    console.error('[API/Places] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
