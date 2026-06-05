import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import client, { COLLECTION_NAME, TYPESENSE_ENABLED } from '@/modules/search/typesenseClient';
import { TypesenseBreaker } from '@/modules/search/typesenseBreaker';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tourist-places/count
 * 
 * Fetches the total count of tourist places.
 * Priority: Typesense (per_page: 0) -> Firestore count aggregation (index-only read, costs 1 read per 1000 items).
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate and authorize request
    const user = await authenticateRequest(req);
    requireAdmin(user);

    console.log('[Admin:TouristPlaces:Count] GET count requested');

    // 2. Try Typesense if enabled and healthy
    if (TYPESENSE_ENABLED && !TypesenseBreaker.isOpen()) {
      try {
        const searchResult = await client
          .collections(COLLECTION_NAME)
          .documents()
          .search({
            q: '*',
            per_page: 0, // Gets count only, returns 0 hits
          });

        TypesenseBreaker.recordSuccess();

        console.log('[Admin:TouristPlaces:Count] count resolved via Typesense:', searchResult.found);

        return ok({
          totalCount: searchResult.found ?? 0,
          source: 'typesense',
        });
      } catch (error: any) {
        TypesenseBreaker.recordFailure();
        console.warn(
          '[Admin:TouristPlaces:Count] Typesense query failed, falling back to Firestore count aggregation:',
          error?.message || error
        );
      }
    }

    // 3. Fallback to Firestore count aggregation
    console.info('[Admin:TouristPlaces:Count] Using Firestore count aggregation fallback');
    const collectionRef = adminDb.collection('touristPlaces');
    const snapshot = await collectionRef.count().get();
    const totalCount = snapshot.data().count;

    console.log('[Admin:TouristPlaces:Count] count resolved via Firestore:', totalCount);

    return ok({
      totalCount,
      source: 'firestore_count',
    });

  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to fetch tourist places count';
    console.error('[Admin:TouristPlaces:Count] Error:', message);
    return fail(message, 500);
  }
}
