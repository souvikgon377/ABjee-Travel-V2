import { ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SETTINGS_TIMEOUT_MS = 1500;

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timed out: ${label}`)), SETTINGS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const isTransientDataError = (error: unknown) => {
  const rawCode = (error as { code?: unknown })?.code;
  const code = String(rawCode ?? '').toLowerCase();
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();

  return (
    rawCode === 8 ||
    code.includes('resource-exhausted') ||
    code.includes('quota') ||
    code.includes('deadline') ||
    code.includes('unavailable') ||
    code.includes('timed out') ||
    message.includes('resource_exhausted') ||
    message.includes('resource-exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('quota') ||
    message.includes('deadline') ||
    message.includes('unavailable') ||
    message.includes('timed out')
  );
};

export async function GET() {
  try {
    const snapshot = await withTimeout(adminDb.collection('admin_settings').doc('system').get(), 'public settings') as any;
    const raw = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const pricing = raw.pricing && typeof raw.pricing === 'object' ? (raw.pricing as Record<string, unknown>) : {};

    const settings = {
      homePageEnabled: raw.homePageEnabled === true,
      bookingCategoriesEnabled: raw.bookingCategoriesEnabled !== false,
      pricing: {
        currency: typeof pricing.currency === 'string' && pricing.currency.trim() ? pricing.currency.trim().toUpperCase() : 'INR',
        adMonthly: Number(pricing.adMonthly) || 100,
        adQuarterly: Number(pricing.adQuarterly) || 250,
        adYearly: Number(pricing.adYearly) || 800,
      },
    };

    return ok(settings, 200);
  } catch (error) {
    if (process.env.NODE_ENV === 'development' && !isTransientDataError(error)) {
      console.error('Failed to fetch public settings:', error);
    }

    return ok(
      {
        homePageEnabled: false,
        bookingCategoriesEnabled: true,
        pricing: {
          currency: 'INR',
          adMonthly: 100,
          adQuarterly: 250,
          adYearly: 800,
        },
        _fallback: true,
      },
      200,
    );
  }
}
