import { NextRequest } from 'next/server';
import { SearchService } from '@/modules/search/SearchService';
import { RateLimitService } from '@/modules/auth/RateLimitService';
import { ok, fail } from '@/lib/server/http';
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

export async function GET(req: NextRequest) {
  const tStart = Date.now();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || searchParams.get('search') || '';
  const location = searchParams.get('location') || '';
  const filter = searchParams.get('filter') || 'all';
  const category = searchParams.get('category') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '12')));
  const forceRefresh = searchParams.get('forceRefresh') === 'true';

  // 1. Rate Limiting (30 requests/min per IP)
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateLimit = await RateLimitService.check(`search:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return fail('Rate limit exceeded. Please try again in a minute.', 429);
  }

  try {
    // 2. Shared tourist-place search flow:
    // Typesense -> L1/L2 cache -> snapshot -> optimized Firestore -> safe fallback
    const result = await SearchService.searchPlaces({
      query,
      location,
      category,
      contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
      page,
      limit,
      forceRefresh,
      isActive: undefined,
    });

    const enrichedResults = await enrichPlacesWithMapUrls(result.results);
    const totalLatency = Date.now() - tStart;

    // 3. Return response with metrics
    return ok({
      ...result,
      rows: enrichedResults,
      results: enrichedResults,
      metrics: {
        totalLatencyMs: totalLatency,
        engineLatencyMs: result.latencyMs,
        source: result.source,
        firestoreReads: result.firestoreReads || 0,
      },
    });

  } catch (error: any) {
    console.error('[SearchAPI] Fatal Error:', error);
    return fail('Search service encountered a fatal error.', 500);
  }
}
