import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';

export const runtime = 'nodejs';

/**
 * GET /api/advertisements/list
 * 
 * Public advertisements endpoint. Powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = params.get('search') || '';
    const category = params.get('category') || 'all';
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '30')));
    const forceRefresh = params.get('forceRefresh') === 'true';

    const result = await SearchService.searchAdvertisements({
      query: search,
      category,
      status: 'approved', // Public API only returns approved ads
      page,
      limit,
      forceRefresh,
    });

    return ok({
      data: result.results,
      rows: result.results,
      total: result.totalCount,
      totalCount: result.totalCount,
      page,
      hasMore: result.hasMore,
      source: result.source,
      latencyMs: result.latencyMs,
    });
  } catch (error: any) {
    console.error('[API/Advertisements/List] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
