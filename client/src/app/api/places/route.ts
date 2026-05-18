import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

async function enrichPlacesWithMapUrls(rows: any[]) {
  const missingMapIds = rows
    .filter((row) => row?.id && !String(row.googleMapsUrl || '').trim())
    .map((row) => String(row.id));

  if (missingMapIds.length === 0) return rows;

  const refs = missingMapIds.map((id) => adminDb.collection('touristPlaces').doc(id));
  const docs = await adminDb.getAll(...refs).catch(() => []);
  const byId = new Map(docs.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() || {}]));

  return rows.map((row) => {
    const full = byId.get(String(row?.id || ''));
    if (!full) return row;

    return {
      ...row,
      googleMapsUrl: row.googleMapsUrl || full.googleMapsUrl || '',
      extraInfo: row.extraInfo || full.extraInfo || [],
      media: row.media || full.media || [],
    };
  });
}

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
    const limit = Math.min(20, Math.max(1, Number(params.get('limit') || '12')));

    const result = await SearchService.searchPlaces({
      query: search,
      location,
      category: filter !== 'all' ? filter : category,
      page,
      limit,
      isActive: undefined // Show all results to match admin-side behavior
    });

    const enrichedResults = await enrichPlacesWithMapUrls(result.results);

    // Return search results - ok() will wrap with { success: true, data: {...} }
    return ok({
      rows: enrichedResults,
      results: enrichedResults,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      queryName: 'typesense',
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
