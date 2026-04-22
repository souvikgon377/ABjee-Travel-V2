import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { invalidateCacheVersion } from '@/lib/server/cacheVersioned';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const body = await req.json();
    const { name, area, state, country, description, category, googleMapsUrl, coverImage, media, extraInfo } = body;

    if (!name || !state || !country) {
      return fail('Missing required fields: name, state, country', 400);
    }

    const touristPlace = {
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
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('touristPlaces').add(touristPlace);
    
    // Invalidate cache after create
    await invalidateCacheVersion();

    return ok(
      {
        id: docRef.id,
        ...touristPlace,
      },
      201,
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to create tourist place';
    console.error('[Admin:TouristPlaces:Create] Error:', message);
    return fail(message, 500);
  }
}
