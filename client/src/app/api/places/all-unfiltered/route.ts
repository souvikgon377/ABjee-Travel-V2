import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

/**
 * GET /api/places/all-unfiltered
 * 
 * Direct Firestore scan returning ALL tourist places (including those without isActive set).
 * Bypasses Typesense and treats missing isActive as active by default.
 * Used when we need to ensure we get all 2141 documents.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const search = (params.get('search') || '').toLowerCase().trim();
    const category = params.get('category') || 'all';

    const tStart = Date.now();

    // Scan ALL documents without filtering by isActive
    let query: any = adminDb
      .collection('touristPlaces');

    const snapshot = await query.get();
    
    // In-memory filtering: exclude only if explicitly false
    let allDocs = snapshot.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((doc: any) => doc.isActive !== false); // Treat missing as active

    // Apply search filter in-memory if provided
    let filtered = allDocs;
    if (search) {
      filtered = allDocs.filter((doc: any) => {
        const name = String(doc.name || '').toLowerCase();
        const city = String(doc.city || '').toLowerCase();
        const state = String(doc.state || '').toLowerCase();
        const country = String(doc.country || '').toLowerCase();
        const location_search = String(doc.location_search || '').toLowerCase();
        const area = String(doc.area || '').toLowerCase();
        
        return (
          name.includes(search) ||
          city.includes(search) ||
          state.includes(search) ||
          country.includes(search) ||
          location_search.includes(search) ||
          area.includes(search)
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
        queryName: 'firestore_unfiltered',
        source: 'firestore_unfiltered',
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
    console.error('[API/Places/All-Unfiltered] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
