import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { getSharedPlacesCache, paginateSharedPlaces } from '@/lib/server/sharedPlacesCache';
import { normalize, adminSearch } from '@/lib/server/touristSearchUtils';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: unknown;
      page?: unknown;
    };

    const search = typeof body.query === 'string' ? body.query : '';
    const normalizedSearch = normalize(search) || "all";
    
    const pageParam = Number(body.page);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit = 12;

    if (!search || normalizedSearch === "all") {
      const dataset = await getSharedPlacesCache();
      const paginated = paginateSharedPlaces(dataset.places, page, limit);
      return ok({
        results: paginated.rows,
        hasMore: paginated.hasMore,
        totalCount: paginated.total,
        searchTerm: search,
        page,
        searchMethod: 'all'
      });
    }

    // Use unifying resilient adminSearch engine directly
    const searchResult = await adminSearch({ search, location: '', filter: 'all', page, limit });

    return ok({
      results: searchResult.data,
      hasMore: searchResult.hasMore,
      totalCount: searchResult.total,
      searchTerm: search,
      page,
      searchMethod: searchResult.cacheStatus === 'hit' ? 'snapshot' : searchResult.source
    });
  } catch (error) {
    console.error('Tourist place search failed:', error);
    return fail('Failed to search tourist places', 500);
  }
}