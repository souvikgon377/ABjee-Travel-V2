import { ok, fail, withCacheHeaders } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { CacheService } from '@/modules/cache/CacheService';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const SLOW_QUERY_MS = 200;

export async function GET(req: Request) {
  try {
    const startedAt = Date.now();
    const { searchParams } = new URL(req.url);
    const requestedLimit = Number(searchParams.get('limit') || DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_LIMIT;

    const cacheKey = `api:offers:limit:${limit}`;

    console.info('[FirestoreQuery] /api/offers request', {
      collection: 'offers',
      orderBy: ['priority', 'asc'],
      limit,
      cacheKey,
    });

    const rows = await CacheService.get(cacheKey, async () => {
      const snapshot = await adminDb
        .collection('offers')
        .orderBy('priority', 'asc')
        .limit(limit)
        .get();

      const data = snapshot.docs
        .map((doc: any) => ({ id: doc.id, ...doc.data() } as any))
        .filter((offer: any) => offer.isActive !== false);

      console.info('[FirestoreResult] /api/offers cache-fill', {
        docsRead: snapshot.size,
        rowsReturned: data.length,
        sampleIds: data.slice(0, 5).map((offer: any) => offer.id),
      });

      return data;
    }, 300);

    console.info('[Offers] BOUNDED_QUERY', {
      limit,
      rowsReturned: rows.length,
      durationMs: Date.now() - startedAt,
    });

    const durationMs = Date.now() - startedAt;
    if (durationMs > SLOW_QUERY_MS) {
      console.warn('[Offers] SLOW_QUERY', { route: '/api/offers', durationMs, rowsReturned: rows.length });
    }

    return withCacheHeaders(ok(rows), 60, 300);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch offers';
    return fail(message, 500);
  }
}
