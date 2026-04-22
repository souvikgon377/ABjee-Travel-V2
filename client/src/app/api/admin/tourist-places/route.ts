import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { invalidateCacheVersion } from '@/lib/server/cacheManagement';

export const runtime = 'nodejs';

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
    const { name, area, state, country, description, category, googleMapsUrl, coverImage, media, extraInfo, isActive } = body;

    if (!name || !state || !country) {
      return fail('Missing required fields: name, state, country', 400);
    }

    const docRef = adminDb.collection('touristPlaces').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists()) {
      return fail('Tourist place not found', 404);
    }

    const updateData = {
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
      updatedAt: new Date(),
    };

    await docRef.update(updateData);
    
    // Invalidate cache after update
    await invalidateCacheVersion();

    return ok({
      id,
      ...docSnap.data(),
      ...updateData,
    });
  } catch (error: unknown) {
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

    if (!docSnap.exists()) {
      return fail('Tourist place not found', 404);
    }

    await docRef.delete();
    
    // Invalidate cache after delete
    await invalidateCacheVersion();

    return ok({ deleted: true, id });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to delete tourist place';
    console.error('[Admin:TouristPlaces:Delete] Error:', message);
    return fail(message, 500);
  }
}
