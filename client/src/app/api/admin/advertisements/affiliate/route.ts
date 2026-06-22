import { NextRequest } from 'next/server';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { adminDb, FieldValue } from '@/lib/server/firebaseAdmin';
import { fail, ok } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { SyncService } from '@/modules/search/SyncService';
import { initializeTypesense } from '@/modules/search/typesenseClient';

export const runtime = 'nodejs';

const DEFAULT_WIDGET_HREF = 'https://widget.getyourguide.com/default/activities.frame';
const DEFAULT_PARTNER_ID = 'P2598GX';

const requireHttpUrl = (value: unknown, label: string) => {
  const input = String(value || '').trim();
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid HTTP or HTTPS URL.`);
  }
};

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json();
    const name = String(body.name || '').trim();
    const affiliateLink = requireHttpUrl(body.affiliateLink, 'Affiliate link');
    const widgetHref = requireHttpUrl(body.widgetHref || DEFAULT_WIDGET_HREF, 'Widget URL');
    const partnerId = String(body.partnerId || DEFAULT_PARTNER_ID).trim();
    const localeCode = String(body.localeCode || 'en-US').trim();
    const tourIds = String(body.tourIds || '').trim();
    const numberOfItems = Math.min(4, Math.max(1, Number(body.numberOfItems) || 1));

    if (!name) return fail('Advertisement title is required.', 400);
    if (!partnerId) return fail('Partner ID is required.', 400);
    if (!tourIds) return fail('At least one GetYourGuide tour ID is required.', 400);
    if (!/^\d+(\s*,\s*\d+)*$/.test(tourIds)) {
      return fail('Tour IDs must be numbers separated by commas.', 400);
    }

    const now = FieldValue.serverTimestamp();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 10);

    const payload = {
      adType: 'affiliate',
      affiliateProvider: 'getyourguide',
      name,
      description: String(body.description || '').trim(),
      affiliateLink,
      widgetHref,
      partnerId,
      localeCode,
      tourIds,
      numberOfItems,
      country: String(body.country || '').trim(),
      state: String(body.state || '').trim(),
      area: String(body.area || '').trim(),
      category: 'Affiliate',
      photoUrl: '',
      mobileNumber: '',
      ownerEmail: String(currentUser.email || '').trim(),
      ownerName: 'ABjee Travel',
      status: 'approved',
      approvalStatus: 'approved',
      paid: true,
      plan: 'affiliate',
      rating: 0,
      comments: [],
      createdAt: now,
      updatedAt: now,
      approvedAt: now,
      subscriptionExpiresAt: expiresAt.toISOString(),
    };

    const docRef = await adminDb.collection('advertisements').add(payload);
    const saved = { id: docRef.id, ...payload };

    try {
      await initializeTypesense();
      await SyncService.syncAdvertisement(saved);
      await SearchService.invalidateSearchCache('affiliate-advertisement-create');
    } catch (syncError) {
      console.warn('[Admin:AffiliateAdvertisement] Search sync failed:', syncError);
    }

    return ok({ id: docRef.id, message: 'Affiliate advertisement published.' }, 201);
  } catch (error: any) {
    console.error('[Admin:AffiliateAdvertisement] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish affiliate advertisement.';
    const status = Number(error?.status) || (message.includes('valid HTTP') ? 400 : 500);
    return fail(message, status);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return fail('Advertisement ID is required.', 400);

    const name = String(body.name || '').trim();
    const affiliateLink = requireHttpUrl(body.affiliateLink, 'Affiliate link');
    const widgetHref = requireHttpUrl(body.widgetHref || DEFAULT_WIDGET_HREF, 'Widget URL');
    const partnerId = String(body.partnerId || DEFAULT_PARTNER_ID).trim();
    const localeCode = String(body.localeCode || 'en-US').trim();
    const tourIds = String(body.tourIds || '').trim();
    const numberOfItems = Math.min(4, Math.max(1, Number(body.numberOfItems) || 1));

    if (!name) return fail('Advertisement title is required.', 400);
    if (!partnerId) return fail('Partner ID is required.', 400);
    if (!tourIds) return fail('At least one GetYourGuide tour ID is required.', 400);
    if (!/^\d+(\s*,\s*\d+)*$/.test(tourIds)) {
      return fail('Tour IDs must be numbers separated by commas.', 400);
    }

    const docRef = adminDb.collection('advertisements').doc(id);
    const existing = await docRef.get();
    if (!existing.exists) return fail('Advertisement not found.', 404);

    const now = FieldValue.serverTimestamp();

    const updatePayload = {
      name,
      description: String(body.description || '').trim(),
      affiliateLink,
      widgetHref,
      partnerId,
      localeCode,
      tourIds,
      numberOfItems,
      country: String(body.country || '').trim(),
      state: String(body.state || '').trim(),
      area: String(body.area || '').trim(),
      editedByEmail: String(currentUser.email || '').trim(),
      editedAt: now,
      updatedAt: now,
    };

    await docRef.update(updatePayload);
    const saved = { id, ...existing.data(), ...updatePayload };

    try {
      await initializeTypesense();
      await SyncService.syncAdvertisement(saved);
      await SearchService.invalidateSearchCache('affiliate-advertisement-update');
    } catch (syncError) {
      console.warn('[Admin:AffiliateAdvertisement] Search sync failed:', syncError);
    }

    return ok({ id, message: 'Affiliate advertisement updated.' });
  } catch (error: any) {
    console.error('[Admin:AffiliateAdvertisement] PUT error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update affiliate advertisement.';
    const status = Number(error?.status) || (message.includes('valid HTTP') ? 400 : 500);
    return fail(message, status);
  }
}
