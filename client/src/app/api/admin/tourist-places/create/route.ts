import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { invalidateCacheVersion } from '@/lib/server/cacheManagement';
import { updateSharedPlaceInCache } from '@/lib/server/sharedPlacesCache';

export const runtime = 'nodejs';

const normalizeSearchField = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildSearchTokens = (...values: unknown[]) => {
  const tokens = new Set<string>();
  const words = normalizeSearchField(values.filter(Boolean).join(' '))
    .split(' ')
    .filter((word) => word.length >= 2);

  for (const word of words) {
    tokens.add(word);
    const maxPrefixLength = Math.min(word.length, 20);
    for (let i = 2; i <= maxPrefixLength; i += 1) {
      tokens.add(word.slice(0, i));
    }
  }

  return Array.from(tokens).slice(0, 500);
};

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
    const searchFields = {
      name_lower: normalizeSearchField(touristPlace.name),
      location_search: normalizeSearchField([
        touristPlace.country,
        touristPlace.state,
        touristPlace.city,
        touristPlace.area,
      ].filter(Boolean).join(' ')),
      location_lower: normalizeSearchField([
        touristPlace.area,
        touristPlace.city,
        touristPlace.state,
        touristPlace.country,
      ].filter(Boolean).join(' ')),
      description_lower: normalizeSearchField(touristPlace.description),
      search_tokens: buildSearchTokens(
        touristPlace.name,
        touristPlace.area,
        touristPlace.city,
        touristPlace.state,
        touristPlace.country,
        touristPlace.category
      ),
    };

    const docRef = await adminDb.collection('touristPlaces').add({
      ...touristPlace,
      ...searchFields,
    });
    
    // Update Redis dataset cache
    await updateSharedPlaceInCache({
      id: docRef.id,
      ...touristPlace,
      ...searchFields,
      Name: touristPlace.name,
      Area: touristPlace.area,
      State: touristPlace.state,
      Country: touristPlace.country,
      Category: touristPlace.category,
      Description: touristPlace.description
    }, 'create');

    // Invalidate cache after create
    await invalidateCacheVersion();

    return ok(
      {
        id: docRef.id,
        ...touristPlace,
        ...searchFields,
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
