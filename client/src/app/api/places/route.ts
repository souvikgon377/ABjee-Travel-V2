import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { enrichTouristPlacesFromFirestore } from '@/lib/server/touristPlaceHydration';
import { authenticateRequest } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { SyncService } from '@/modules/search/SyncService';

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

/**
 * GET /api/places
 * 
 * Main tourist places endpoint. Fully powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = params.get('search') || '';
    const location = params.get('location') || '';
    const filter = params.get('filter') || 'all';
    const category = params.get('category') || 'all';
    const page = Math.max(1, Number(params.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || '12')));
    const forceRefresh = params.get('forceRefresh') === 'true';

    const result = await SearchService.searchPlaces({
      query: search,
      location,
      category,
      contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
      page,
      limit,
      forceRefresh,
      isActive: true // Filter out unapproved/requested tourist places for public search
    });

    const enrichedResults = await enrichTouristPlacesFromFirestore(result.results);

    // Return search results - ok() will wrap with { success: true, data: {...} }
    return ok({
      rows: enrichedResults,
      results: enrichedResults,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      queryName: result.source,
      source: result.source,
      latencyMs: result.latencyMs,
      pagination: {
        page,
        limit,
        total: result.totalCount,
        hasNext: result.hasMore
      }
    });

  } catch (error: any) {
    console.error('[API/Places] GET error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}

/**
 * POST /api/places
 * 
 * Allows users to request/suggest a new place. Stored as inactive.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return fail('Unauthorized. Please login to request a tourist place.', 401);
    }

    const body = await req.json().catch(() => ({}));
    const { name, area, state, country, description, category, googleMapsUrl, coverImage } = body;

    if (!name || !state || !country) {
      return fail('Missing required fields: name, state, country', 400);
    }

    const currentUserId = String(user.id || user.firebaseUid || '').trim();
    const currentFirebaseUid = String(user.firebaseUid || user.id || '').trim();
    const userEmail = user.email || '';
    const userName = user.displayName || 'Customer';

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
      media: coverImage ? [{ url: String(coverImage).trim(), publicId: String(coverImage).trim(), type: 'image' as const }] : [],
      extraInfo: [],
      isActive: false, // Inactive until admin approves
      isRequested: true, // Mark as user-requested
      requestedBy: {
        uid: currentUserId || currentFirebaseUid,
        email: userEmail,
        name: userName,
        requestedAt: new Date(),
      },
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

    // 1. Add to Firestore
    const docRef = await adminDb.collection('touristPlaces').add({
      ...touristPlace,
      ...searchFields,
    });

    // 2. Sync to Typesense with isActive: false
    try {
      await SyncService.syncOnCreate({
        id: docRef.id,
        name: touristPlace.name,
        city: touristPlace.city,
        state: touristPlace.state,
        country: touristPlace.country,
        updatedAt: touristPlace.updatedAt,
        category: touristPlace.category,
        coverImage: touristPlace.coverImage,
        description: touristPlace.description,
        googleMapsUrl: touristPlace.googleMapsUrl,
        media: touristPlace.media,
        isActive: false,
      });
    } catch (syncErr) {
      console.warn('[PlacesAPI] Failed to sync requested place to Typesense:', syncErr);
    }

    return ok({
      id: docRef.id,
      pointsAwarded: 0,
      wallet: null,
      message: 'Place request submitted successfully! +5 Abjee Points will be credited once approved.',
    }, 201);

  } catch (error: any) {
    console.error('[API/Places] POST error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
