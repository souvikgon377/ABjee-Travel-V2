import { NextRequest } from 'next/server';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { ok, fail } from '@/lib/server/http';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tourist-places/[id]
 * 
 * Fetch a single tourist place with all fields including media and extraInfo.
 * Used when admin needs full place data for editing.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { id } = params;

    if (!id) {
      return fail('Missing place ID', 400);
    }

    const docRef = adminDb.collection('touristPlaces').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Tourist place not found', 404);
    }

    const data = docSnap.data();

    return ok({
      id: docSnap.id,
      ...data,
    });
  } catch (error: any) {
    console.error('[Admin:TouristPlace:Get] Error:', error);
    return fail('Failed to fetch tourist place', 500);
  }
}
