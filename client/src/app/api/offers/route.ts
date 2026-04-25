import { ok, fail, withCacheHeaders } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

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

    const snapshot = await adminDb
      .collection('offers')
      .orderBy('priority', 'asc')
      .limit(limit)
      .get();

    const rows = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as any))
      .filter((offer) => offer.isActive !== false);

    console.info('[Offers] BOUNDED_QUERY', {
      limit,
      docsRead: snapshot.size,
      rowsReturned: rows.length,
      durationMs: Date.now() - startedAt,
    });

    const durationMs = Date.now() - startedAt;
    if (durationMs > SLOW_QUERY_MS) {
      console.warn('[Offers] SLOW_QUERY', { route: '/api/offers', durationMs, docsRead: snapshot.size });
    }

    return withCacheHeaders(ok(rows), 60, 300);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch offers';
    return fail(message, 500);
  }
}

