import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { ok, fail } from '@/lib/server/http';
import { invalidateCacheVersion } from '@/lib/server/cacheManagement';
import { SyncService } from '@/modules/search/SyncService';
import { CacheService } from '@/modules/cache/CacheService';
import { MetricsService } from '@/modules/analytics/MetricsService';
import { updateSharedPlaceInCache } from '@/lib/server/sharedPlacesCache';

export const runtime = 'nodejs';

/**
 * GET /api/admin/tourist-places/[id]
 * 
 * Fetch a single tourist place with all fields including media and extraInfo.
 * Used when admin needs full place data for editing.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { id } = await context.params;
    const placeId = String(id || '').trim();

    if (!placeId) {
      return fail('Missing place ID', 400);
    }

    const docRef = adminDb.collection('touristPlaces').doc(placeId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Tourist place not found', 404);
    }

    const data = docSnap.data();

    return ok({
      id: docSnap.id,
      ...data,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    console.error('[Admin:TouristPlace:Get] Error:', error);
    return fail('Failed to fetch tourist place', 500);
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { id } = await context.params;
    const placeId = String(id || '').trim();

    if (!placeId) return fail('Missing place ID', 400);

    const body = await req.json().catch(() => ({}));
    const { name, area, state, country, description, category, googleMapsUrl, coverImage, media, extraInfo, isActive, popularity } = body;

    if (!name || !state || !country) return fail('Missing required fields: name, state, country', 400);

    const docRef = adminDb.collection('touristPlaces').doc(placeId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return fail('Tourist place not found', 404);

    const updateData: any = {
      name: String(name).trim(),
      area: String(area || '').trim(),
      city: String(area || '').trim(),
      state: String(state).trim(),
      country: String(country).trim(),
      description: String(description || '').trim(),
      category: String(category || 'Other').trim(),
      googleMapsUrl: String(googleMapsUrl || '').trim(),
      coverImage: String(coverImage || '').trim(),
      media: Array.isArray(media) ? media : [],
      extraInfo: Array.isArray(extraInfo) ? extraInfo : [],
      isActive: isActive !== false,
      popularity: Number(popularity || 0),
      updatedAt: new Date(),
    };

    const normalizeSearchField = (value: unknown) =>
      String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const searchFields = {
      name_lower: normalizeSearchField(updateData.name),
      location_search: normalizeSearchField([
        updateData.country,
        updateData.state,
        updateData.city,
        updateData.area,
      ].filter(Boolean).join(' ')),
      location_lower: normalizeSearchField([
        updateData.area,
        updateData.city,
        updateData.state,
        updateData.country,
      ].filter(Boolean).join(' ')),
      description_lower: normalizeSearchField(updateData.description),
    };

    console.info('[Admin:TouristPlace:Update] Updating place', { id: placeId });
    await docRef.update({ ...updateData, ...searchFields });

    // Read back the updated doc to return authoritative data
    const updatedSnap = await docRef.get();

    // Sync search index, invalidate caches, bump metrics
    await SyncService.syncOnUpdate({
      id: placeId,
      name: updateData.name,
      city: updateData.city,
      state: updateData.state,
      country: updateData.country,
      popularity: updateData.popularity,
      updatedAt: updateData.updatedAt,
      category: updateData.category,
      coverImage: updateData.coverImage,
    });

    await CacheService.invalidatePattern('search:');
    await CacheService.invalidate(`place:${placeId}`);
    try {
      await updateSharedPlaceInCache({ id: placeId, ...updateData, ...searchFields }, 'update');
    } catch (e) {
      console.warn('[PlacesCache] updateSharedPlaceInCache failed', e);
    }
    await invalidateCacheVersion();
    await MetricsService.increment('admin_write_success');

    return ok({ id: placeId, ...(updatedSnap.exists ? updatedSnap.data() : {}) });
  } catch (error: unknown) {
    await MetricsService.increment('admin_write_fail');
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error('[Admin:TouristPlace:Update] Error:', error);
    return fail('Failed to update tourist place', 500);
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { id } = await context.params;
    const placeId = String(id || '').trim();
    if (!placeId) return fail('Missing place ID', 400);

    const docRef = adminDb.collection('touristPlaces').doc(placeId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return fail('Tourist place not found', 404);

    await docRef.delete();
    await SyncService.syncOnDelete(placeId);
    await CacheService.invalidatePattern('search:');
    await CacheService.invalidate(`place:${placeId}`);
    await invalidateCacheVersion();
    await MetricsService.increment('admin_write_success');

    return ok({ deleted: true, id: placeId });
  } catch (error: unknown) {
    await MetricsService.increment('admin_write_fail');
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error('[Admin:TouristPlace:Delete] Error:', error);
    return fail('Failed to delete tourist place', 500);
  }
}
