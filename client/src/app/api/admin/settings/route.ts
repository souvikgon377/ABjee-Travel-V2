import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';

export const runtime = 'nodejs';

const SETTINGS_COLLECTION = 'admin_settings';
const SETTINGS_DOC_ID = 'system';

const normalizeBoolean = (value: unknown, defaultValue = true) =>
  typeof value === 'boolean' ? value : defaultValue;

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const snapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};

    return ok({
      homePageEnabled: normalizeBoolean(data.homePageEnabled, true),
      bookingCategoriesEnabled: normalizeBoolean(data.bookingCategoriesEnabled, true),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail('Failed to load admin settings', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: user.id || user.firebaseUid || user.email || 'unknown',
    };

    if (Object.prototype.hasOwnProperty.call(body, 'homePageEnabled')) {
      updates.homePageEnabled = !!body.homePageEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'bookingCategoriesEnabled')) {
      updates.bookingCategoriesEnabled = !!body.bookingCategoriesEnabled;
    }

    await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(updates, { merge: true });

    return ok({
      homePageEnabled: normalizeBoolean(updates.homePageEnabled, true),
      bookingCategoriesEnabled: normalizeBoolean(updates.bookingCategoriesEnabled, true),
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail('Failed to update admin settings', 500);
  }
}
