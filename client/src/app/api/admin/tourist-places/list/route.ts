import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tourist-places/list
 * 
 * Admin list view for tourist places. Powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const location = searchParams.get('location') || '';
    const filter = searchParams.get('filter') || 'all';
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '30')));

    // Admin convenience: return all places when `?all=true` is provided.
    if (searchParams.get('all') === 'true') {
      console.warn('[Admin:TouristPlaces:List] Returning ALL places for admin request (unpaginated).');
      const snap = await adminDb.collection('touristPlaces').get();
      const rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      return ok({
        data: rows,
        rows,
        total: rows.length,
        totalCount: rows.length,
        page: 1,
        hasMore: false,
        source: 'firestore_all',
      });
    }

    const result = await SearchService.searchPlaces({
      query: search,
      location,
      filter,
      page,
      limit,
      // Admin sees everything, so we don't filter by isActive:true
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
    console.error('[Admin:TouristPlaces:List] GET Error:', error);
    return fail("Failed to load places.", 500);
  }
}
