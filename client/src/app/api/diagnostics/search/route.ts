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

    // Check Firestore document breakdown
    try {
      const snapshot = await adminDb.collection('touristPlaces').get();
      diagnostics.firestore.total_documents = snapshot.size;

      let with_true = 0;
      let with_false = 0;
      let with_missing = 0;

      snapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.isActive === true) {
          with_true++;
        } else if (data.isActive === false) {
          with_false++;
        } else {
          with_missing++;
        }
      });

      diagnostics.firestore.with_isactive_true = with_true;
      diagnostics.firestore.with_isactive_false = with_false;
      diagnostics.firestore.with_isactive_missing = with_missing;
    } catch (err) {
      diagnostics.firestore.error = String(err);
    }

    return ok(diagnostics);
  } catch (error: any) {
    return fail(error.message || 'Diagnostic check failed', 500);
  }
}
