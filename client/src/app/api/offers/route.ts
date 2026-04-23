import { ok, fail } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('offers').get();
    const rows = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as any))
      .filter((offer) => offer.isActive !== false)
      .sort((a, b) => Number(a.priority ?? 999) - Number(b.priority ?? 999));

    return ok(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch offers';
    return fail(message, 500);
  }
}

