import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';

export const runtime = 'nodejs';

const SETTINGS_COLLECTION = 'admin_settings';
const SETTINGS_DOC_ID = 'system';

const DEFAULT_CURRENCY = 'INR';
const DEFAULT_PRICING = {
  currency: DEFAULT_CURRENCY,
  proMonthly: 2,
  proYearly: 15,
  premiumMonthly: 2,
  premiumYearly: 15,
};
const DEFAULT_PRIVATE_ROOM_LIMITS = {
  pro: 3,
  premium: 10,
};

const normalizeBoolean = (value: unknown, defaultValue = true) =>
  typeof value === 'boolean' ? value : defaultValue;

const normalizeAmount = (value: unknown, fallback: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.round(amount * 100) / 100;
};

const normalizeLimit = (value: unknown, fallback: number) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 0) return fallback;
  return Math.floor(limit);
};

const normalizeCurrency = (value: unknown, fallback = DEFAULT_CURRENCY) => {
  if (typeof value !== 'string') return fallback;
  const next = value.trim().toUpperCase();
  if (!next) return fallback;
  return next;
};

const normalizePricing = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    currency: normalizeCurrency(raw.currency, DEFAULT_PRICING.currency),
    proMonthly: normalizeAmount(raw.proMonthly, DEFAULT_PRICING.proMonthly),
    proYearly: normalizeAmount(raw.proYearly, DEFAULT_PRICING.proYearly),
    premiumMonthly: normalizeAmount(raw.premiumMonthly, DEFAULT_PRICING.premiumMonthly),
    premiumYearly: normalizeAmount(raw.premiumYearly, DEFAULT_PRICING.premiumYearly),
  };
};

const normalizePrivateRoomLimits = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    pro: normalizeLimit(raw.pro, DEFAULT_PRIVATE_ROOM_LIMITS.pro),
    premium: normalizeLimit(raw.premium, DEFAULT_PRIVATE_ROOM_LIMITS.premium),
  };
};

const normalizeSettingsPayload = (data: Record<string, unknown>) => ({
  homePageEnabled: normalizeBoolean(data.homePageEnabled, true),
  bookingCategoriesEnabled: normalizeBoolean(data.bookingCategoriesEnabled, true),
  pricing: normalizePricing(data.pricing),
  privateRoomLimits: normalizePrivateRoomLimits(data.privateRoomLimits),
});

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const snapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};

    return ok(normalizeSettingsPayload(data));
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

    if (Object.prototype.hasOwnProperty.call(body, 'pricing')) {
      updates.pricing = normalizePricing(body.pricing);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'privateRoomLimits')) {
      updates.privateRoomLimits = normalizePrivateRoomLimits(body.privateRoomLimits);
    }

    await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(updates, { merge: true });

    const updatedSnapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const updatedData = updatedSnapshot.exists ? (updatedSnapshot.data() as Record<string, unknown>) : {};

    return ok(normalizeSettingsPayload(updatedData));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail('Failed to update admin settings', 500);
  }
}
