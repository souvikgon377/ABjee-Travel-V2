import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { FieldPath } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

/**
 * GET /api/places/all
 * 
 * Direct Firestore search returning ALL active tourist places.
 * Bypasses Typesense entirely for maximum reliability.
 * Supports pagination and basic filtering.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const search = (params.get('search') || '').toLowerCase().trim();
    const category = params.get('category') || 'all';

    const tStart = Date.now();

    // Start with all active places
    let query: any = adminDb
      .collection('touristPlaces')
      .where('isActive', '==', true);

    const snapshot = await query.get();
    const allDocs = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    // Apply search filter in-memory if provided
    let filtered = allDocs;
    if (search) {
      filtered = allDocs.filter((doc: any) => {
        const name = String(doc.name || '').toLowerCase();
        const city = String(doc.city || '').toLowerCase();
        const state = String(doc.state || '').toLowerCase();
        const country = String(doc.country || '').toLowerCase();
        const location_search = String(doc.location_search || '').toLowerCase();
        
        return (
          name.includes(search) ||
          city.includes(search) ||
          state.includes(search) ||
          country.includes(search) ||
          location_search.includes(search)
        );
      });
    }

    // Apply category filter
    if (category && category !== 'all') {
      filtered = filtered.filter((doc: any) => doc.category === category);
    }

    // Paginate
    const totalCount = filtered.length;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const paginatedResults = filtered.slice(startIdx, endIdx);
    const hasMore = endIdx < totalCount;

    const latency = Date.now() - tStart;

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
          hasNext: hasMore
        }
      }
    });

  } catch (error: any) {
    console.error('[API/Places/All] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
