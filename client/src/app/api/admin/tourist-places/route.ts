import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { invalidateCacheVersion } from '@/lib/server/cacheManagement';
import { SyncService } from '@/modules/search/SyncService';
import { CacheService } from '@/modules/cache/CacheService';
import { MetricsService } from '@/modules/analytics/MetricsService';

export const runtime = 'nodejs';

const normalizeSearchField = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return fail('Missing query parameter: id', 400);
    }

    const body = await req.json();
    const { name, area, state, country, description, category, googleMapsUrl, coverImage, media, extraInfo, isActive, popularity } = body;

    if (!name || !state || !country) {
      return fail('Missing required fields: name, state, country', 400);
    }

    const docRef = adminDb.collection('touristPlaces').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Tourist place not found', 404);
    }

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

    await docRef.update({
      ...updateData,
      ...searchFields,
    });
    
    // 1. Real-time Search Sync (via Queue)
    await SyncService.syncOnUpdate({
      id,
      name: updateData.name,
      city: updateData.city,
      state: updateData.state,
      country: updateData.country,
      popularity: updateData.popularity,
      updatedAt: updateData.updatedAt,
      category: updateData.category,
      coverImage: updateData.coverImage
    });

    // 2. Cache Invalidation
    await CacheService.invalidatePattern('search:'); // Invalidate all search caches
    await CacheService.invalidate(`place:${id}`);

    // 3. Invalidate cache version for page caches
    await invalidateCacheVersion();
    await MetricsService.increment('admin_write_success');

    return ok({
      id,
      ...docSnap.data(),
      ...updateData,
      ...searchFields,
    });
  } catch (error: unknown) {
    await MetricsService.increment('admin_write_fail');
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to update tourist place';
    console.error('[Admin:TouristPlaces:Update] Error:', message);
    return fail(message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return fail('Missing query parameter: id', 400);
    }

    const docRef = adminDb.collection('touristPlaces').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Tourist place not found', 404);
    }

    await docRef.delete();
    
    // 1. Real-time Search Sync (Delete)
    await SyncService.syncOnDelete(id);

    // 2. Cache Invalidation
    await CacheService.invalidatePattern('search:');
    await CacheService.invalidate(`place:${id}`);

    // 3. Invalidate cache version for page caches
    await invalidateCacheVersion();
    await MetricsService.increment('admin_write_success');

    return ok({ deleted: true, id });
  } catch (error: unknown) {
    await MetricsService.increment('admin_write_fail');
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to delete tourist place';
    console.error('[Admin:TouristPlaces:Delete] Error:', message);
    return fail(message, 500);
  }
}
