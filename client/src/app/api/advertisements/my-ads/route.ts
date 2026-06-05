import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { authenticateRequest } from '@/lib/server/auth';

export const runtime = 'nodejs';

/**
 * GET /api/advertisements/my-ads
 * 
 * Secure endpoint for owners to list their own advertisements (any status) from Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    if (!currentUser || !currentUser.email) {
      return fail('Unauthorized', 401);
    }

    const result = await SearchService.searchAdvertisements({
      query: currentUser.email, // Search by owner email
      status: 'all', // Owner can see pending, approved, and rejected
      limit: 100,
    });

    return ok({
      data: result.results,
      rows: result.results,
      totalCount: result.totalCount,
    });
  } catch (error: any) {
    console.error('[API/Advertisements/MyAds] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
