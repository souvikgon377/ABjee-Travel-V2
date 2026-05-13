import { NextRequest } from 'next/server';
import { SearchService } from '@/modules/search/SearchService';
import { RateLimitService } from '@/modules/auth/RateLimitService';
import { ok, fail } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const tStart = Date.now();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  // 1. Rate Limiting (30 requests/min per IP)
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const rateLimit = await RateLimitService.check(`search:${ip}`, 30, 60);
  if (!rateLimit.allowed) {
    return fail('Rate limit exceeded. Please try again in a minute.', 429);
  }

  try {
    // 2. Search Flow (Cache -> Typesense -> Firestore Fallback)
    // Note: Caching is handled inside SearchService.searchPlaces
    const result = await SearchService.searchPlaces({
      query,
      page,
      isActive: true,
    });

    const totalLatency = Date.now() - tStart;

    // 3. Return response with metrics
    return ok({
      ...result,
      metrics: {
        totalLatencyMs: totalLatency,
        engineLatencyMs: result.latencyMs,
        source: result.source,
        firestoreReads: result.source === 'firestore' ? result.results.length : 0,
      },
    });

  } catch (error: any) {
    console.error('[SearchAPI] Fatal Error:', error);
    return fail('Search service encountered a fatal error.', 500);
  }
}