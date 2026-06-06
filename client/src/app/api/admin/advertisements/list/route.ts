import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';

/**
 * GET /api/admin/advertisements/list
 * 
 * Admin advertisements endpoint. Powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const params = req.nextUrl.searchParams;
    const search = params.get('search') || '';
    const status = params.get('status') || 'all';
    const category = params.get('category') || 'all';
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(1000, Math.max(1, Number(params.get('limit') || '1000'))); // High limit cap to maintain compatibility with existing list UI.
    const forceRefresh = params.get('forceRefresh') === 'true';

    const result = await SearchService.searchAdvertisements({
      query: search,
      status,
      category,
      page,
      limit,
      forceRefresh,
      includeExpired: true,
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
      firestoreReads: result.firestoreReads || 0,
    });
  } catch (error: any) {
    console.error('[Admin:Advertisements:List] GET Error:', error);
    return fail(error.message || 'Failed to load advertisements.', 500);
  }
}
