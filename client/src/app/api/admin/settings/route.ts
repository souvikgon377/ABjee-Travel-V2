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
  proMonthly: 0,
  proYearly: 0,
  premiumMonthly: 0,
  premiumYearly: 0,
  advertizerMonthly: 1000,
  advertizerYearly: 10000,
  adMonthly: 100,
  adQuarterly: 250,
  adYearly: 800,
};
const DEFAULT_PRIVATE_ROOM_LIMITS = {
  pro: 3,
  premium: 10,
  advertizer: 0,
};
const DEFAULT_AD_LIMITS = {
  monthly: 1,
  quarterly: 3,
  yearly: -1, // -1 means unlimited
};
const DEFAULT_AD_DESCRIPTIONS = {
  monthly: 'Best for a single location and one basic banner.',
  quarterly: 'For businesses that want stronger visibility and more clicks.',
  yearly: 'For full brand visibility across your target area.',
};
const DEFAULT_FEATURES = {
  proFeatures: 'Create or join up to 3 private rooms (monthly)\nCreate or join up to 10 private rooms (yearly)\nPrivate room access included\nExpose private rooms for join requests\nPriority support',
  premiumFeatures: 'Create or join up to 3 private rooms (monthly)\nCreate or join up to 10 private rooms (yearly)\nPrivate room access included\nAdvanced member tools\nPriority assistance',
  advertizerFeatures: 'Advertisers plan: Submit ads for approval, priority placement options, analytics dashboard',
  adMonthlyFeatures: 'One live ad\nStandard placement\nEmail support',
  adQuarterlyFeatures: 'Three active ads\nFeatured placement\nPriority review',
  adYearlyFeatures: 'Unlimited campaigns\nTop placement\nDirect support',
};

const normalizeBoolean = (value: unknown, defaultValue = false) =>
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
    advertizerMonthly: normalizeAmount(raw.advertizerMonthly, DEFAULT_PRICING.advertizerMonthly),
    advertizerYearly: normalizeAmount(raw.advertizerYearly, DEFAULT_PRICING.advertizerYearly),
    adMonthly: normalizeAmount(raw.adMonthly, DEFAULT_PRICING.adMonthly),
    adQuarterly: normalizeAmount(raw.adQuarterly, DEFAULT_PRICING.adQuarterly),
    adYearly: normalizeAmount(raw.adYearly, DEFAULT_PRICING.adYearly),
  };
};

const normalizePrivateRoomLimits = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    pro: normalizeLimit(raw.pro, DEFAULT_PRIVATE_ROOM_LIMITS.pro),
    premium: normalizeLimit(raw.premium, DEFAULT_PRIVATE_ROOM_LIMITS.premium),
    advertizer: normalizeLimit(raw.advertizer, DEFAULT_PRIVATE_ROOM_LIMITS.advertizer),
  };
};

const normalizeAdLimits = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    monthly: normalizeLimit(raw.monthly, DEFAULT_AD_LIMITS.monthly),
    quarterly: normalizeLimit(raw.quarterly, DEFAULT_AD_LIMITS.quarterly),
    yearly: typeof raw.yearly === 'number' && raw.yearly === -1 ? -1 : normalizeLimit(raw.yearly, DEFAULT_AD_LIMITS.yearly),
  };
};

const normalizeAdDescriptions = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    monthly: typeof raw.monthly === 'string' && raw.monthly.trim() ? raw.monthly.trim() : DEFAULT_AD_DESCRIPTIONS.monthly,
    quarterly: typeof raw.quarterly === 'string' && raw.quarterly.trim() ? raw.quarterly.trim() : DEFAULT_AD_DESCRIPTIONS.quarterly,
    yearly: typeof raw.yearly === 'string' && raw.yearly.trim() ? raw.yearly.trim() : DEFAULT_AD_DESCRIPTIONS.yearly,
  };
};

const normalizeFeatures = (value: unknown) => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    proFeatures: typeof raw.proFeatures === 'string' && raw.proFeatures.trim() ? raw.proFeatures.trim() : DEFAULT_FEATURES.proFeatures,
    premiumFeatures: typeof raw.premiumFeatures === 'string' && raw.premiumFeatures.trim() ? raw.premiumFeatures.trim() : DEFAULT_FEATURES.premiumFeatures,
    advertizerFeatures: typeof raw.advertizerFeatures === 'string' && raw.advertizerFeatures.trim() ? raw.advertizerFeatures.trim() : DEFAULT_FEATURES.advertizerFeatures,
    adMonthlyFeatures: typeof raw.adMonthlyFeatures === 'string' && raw.adMonthlyFeatures.trim() ? raw.adMonthlyFeatures.trim() : DEFAULT_FEATURES.adMonthlyFeatures,
    adQuarterlyFeatures: typeof raw.adQuarterlyFeatures === 'string' && raw.adQuarterlyFeatures.trim() ? raw.adQuarterlyFeatures.trim() : DEFAULT_FEATURES.adQuarterlyFeatures,
    adYearlyFeatures: typeof raw.adYearlyFeatures === 'string' && raw.adYearlyFeatures.trim() ? raw.adYearlyFeatures.trim() : DEFAULT_FEATURES.adYearlyFeatures,
  };
};

const normalizeSettingsPayload = (data: Record<string, unknown>) => ({
  homePageEnabled: normalizeBoolean(data.homePageEnabled, false),
  bookingCategoriesEnabled: normalizeBoolean(data.bookingCategoriesEnabled, true),
  pricing: normalizePricing(data.pricing),
  privateRoomLimits: normalizePrivateRoomLimits(data.privateRoomLimits),
  adLimits: normalizeAdLimits(data.adLimits),
  adDescriptions: normalizeAdDescriptions(data.adDescriptions),
  features: normalizeFeatures(data.features),
});

const isDatastoreTransientError = (error: unknown) => {
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();

  return (
    code === '8' ||
    code.includes('resource-exhausted') ||
    code.includes('quota') ||
    code.includes('unavailable') ||
    code.includes('deadline') ||
    message.includes('resource_exhausted') ||
    message.includes('resource-exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('quota') ||
    message.includes('unavailable') ||
    message.includes('deadline')
  );
};

const DEFAULT_SETTINGS_PAYLOAD = {
  homePageEnabled: false,
  bookingCategoriesEnabled: true,
  pricing: { ...DEFAULT_PRICING },
  privateRoomLimits: { ...DEFAULT_PRIVATE_ROOM_LIMITS },
  adLimits: { ...DEFAULT_AD_LIMITS },
  adDescriptions: { ...DEFAULT_AD_DESCRIPTIONS },
  features: { ...DEFAULT_FEATURES },
};

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

    // For temporary Firestore outages/quota limits, return defaults so the admin UI stays usable.
    if (isDatastoreTransientError(error)) {
      return ok({
        ...DEFAULT_SETTINGS_PAYLOAD,
        _degraded: true,
      });
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

    if (Object.prototype.hasOwnProperty.call(body, 'features')) {
      updates.features = normalizeFeatures(body.features);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'adLimits')) {
      updates.adLimits = normalizeAdLimits(body.adLimits);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'adDescriptions')) {
      updates.adDescriptions = normalizeAdDescriptions(body.adDescriptions);
    }

    await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).set(updates, { merge: true });

    const updatedSnapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const updatedData = updatedSnapshot.exists ? (updatedSnapshot.data() as Record<string, unknown>) : {};

    // Sync to Typesense in the background / gracefully
    try {
      const { SyncService } = await import('@/modules/search/SyncService');
      await SyncService.syncSettings({
        id: SETTINGS_DOC_ID,
        ...updatedData
      });
    } catch (syncErr) {
      console.error('[Settings API] Failed to sync settings to Typesense:', syncErr);
    }

    return ok(normalizeSettingsPayload(updatedData));
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail('Failed to update admin settings', 500);
  }
}
