import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    // Get total count of travel destinations
    const snapshot = await db.collection('travel-destinations').count().get();
    const total = snapshot.data().count;

    return ok({ total, updatedAt: new Date().toISOString() }, 200);
  } catch (error: any) {
    console.error('GET /api/travel/stats error:', error);
    return fail(error.message || 'Failed to fetch travel stats', 500);
  }
}
