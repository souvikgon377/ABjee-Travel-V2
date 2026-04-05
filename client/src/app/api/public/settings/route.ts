import { ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('admin_settings').doc('system').get();
    const raw = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};

    const settings = {
      homePageEnabled: raw.homePageEnabled !== false,
      bookingCategoriesEnabled: raw.bookingCategoriesEnabled !== false,
    };

    return ok(settings, 200);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to fetch public settings:', error);
    }

    return ok(
      {
        homePageEnabled: true,
        bookingCategoriesEnabled: true,
        _fallback: true,
      },
      200,
    );
  }
}
