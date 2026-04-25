import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { getSharedPlacesCache, paginateSharedPlaces } from '@/lib/server/sharedPlacesCache';
import { normalize, searchPlaces, performFuzzySearch } from '@/lib/server/touristSearchUtils';

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

    let results: any[] = [];
    let totalCount = 0;
    let hasMore = false;
    let searchMethod: 'index' | 'fuzzy' | 'all' = 'index';

    if (!search || normalizedSearch === "all") {
      const dataset = await getSharedPlacesCache();
      const pageSize = 12;
      const paginated = paginateSharedPlaces(dataset.places, page, pageSize);
      results = paginated.rows;
      totalCount = paginated.total;
      hasMore = paginated.hasMore;
      searchMethod = 'all';
    } else {
      // 1. SMART SEARCH (Ultra-low latency ID-based flow)
      const searchResult = await searchPlaces(search, page);
      
      if (searchResult.data.length === 0) {
        console.log("INDEX MISS: Falling back to fuzzy search");
        const dataset = await getSharedPlacesCache();
        const fuzzyResults = performFuzzySearch(dataset.places, search);
        const pageSize = 12;
        const paginated = paginateSharedPlaces(fuzzyResults, page, pageSize);
        results = paginated.rows;
        totalCount = paginated.total;
        hasMore = paginated.hasMore;
        searchMethod = 'fuzzy';
      } else {
        results = searchResult.data;
        totalCount = searchResult.total;
        hasMore = searchResult.hasMore;
        searchMethod = 'index';
      }
    }

    return ok({
      results,
      hasMore,
      totalCount,
      searchTerm: search,
      page,
      searchMethod
    });
  } catch (error) {
    console.error('Tourist place search failed:', error);
    return fail('Failed to search tourist places', 500);
  }
}