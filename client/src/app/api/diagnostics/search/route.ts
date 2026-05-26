import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { TypesenseBreaker } from '@/modules/search/typesenseBreaker';
import { getRedis } from '@/lib/server/redis';

export const runtime = 'nodejs';

/**
 * GET /api/diagnostics/search
 * 
 * Quick diagnostic endpoint to check search infrastructure.
 */
export async function GET(req: NextRequest) {
  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      typesense: {
        breaker_state: TypesenseBreaker.getState(),
      },
      redis: {
        connected: false,
        url: process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'missing',
      },
      firestore: {
        total_documents: 0,
        with_isactive_true: 0,
        with_isactive_false: 0,
        with_isactive_missing: 0,
      },
    };

    // Check Redis
    try {
      const redis = getRedis();
      if (redis) {
        const pong = await redis.ping();
        diagnostics.redis.connected = pong === 'PONG';
      }
    } catch (err) {
      diagnostics.redis.error = String(err);
    }

    // Check Firestore document breakdown using aggregate counts to avoid
    // fetching all documents (prevents large reads when Redis is unavailable).
    try {
      // Total documents (aggregate count)
      const totalAgg = await adminDb.collection('touristPlaces').count().get();
      diagnostics.firestore.total_documents = totalAgg.data().count || 0;

      // Counts by isActive using aggregate count queries (no document reads)
      const [trueAgg, falseAgg, missingAgg] = await Promise.all([
        adminDb.collection('touristPlaces').where('isActive', '==', true).count().get(),
        adminDb.collection('touristPlaces').where('isActive', '==', false).count().get(),
        adminDb.collection('touristPlaces').where('isActive', '==', null).count().get(),
      ]);

      diagnostics.firestore.with_isactive_true = trueAgg.data().count || 0;
      diagnostics.firestore.with_isactive_false = falseAgg.data().count || 0;
      diagnostics.firestore.with_isactive_missing = missingAgg.data().count || 0;
    } catch (err) {
      diagnostics.firestore.error = String(err);
    }

    return ok(diagnostics);
  } catch (error: any) {
    return fail(error.message || 'Diagnostic check failed', 500);
  }
}
