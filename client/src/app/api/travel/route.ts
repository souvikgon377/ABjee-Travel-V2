import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdminFirestore';
import { FieldPath } from 'firebase-admin/firestore';
import { SearchService } from '@/modules/search/SearchService';
import { SyncService } from '@/modules/search/SyncService';

const DEFAULT_PUBLIC_LIMIT = 20;
const MAX_PUBLIC_LIMIT = 20;
const SLOW_QUERY_MS = 200;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const toRoutePoints = (value: unknown): Array<{ name: string; lat?: number; lng?: number }> => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      if (!name) return null;

      const lat = typeof candidate.lat === 'number' ? candidate.lat : undefined;
      const lng = typeof candidate.lng === 'number' ? candidate.lng : undefined;

      return {
        name,
        ...(typeof lat === 'number' ? { lat } : {}),
        ...(typeof lng === 'number' ? { lng } : {}),
      };
    })
    .filter((item): item is { name: string; lat?: number; lng?: number } => item !== null);
};

const toImageArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const candidate = item as Record<string, unknown>;
          if (typeof candidate.url === 'string') return candidate.url.trim();
          if (typeof candidate.image === 'string') return candidate.image.trim();
        }
        return '';
      })
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const normalizeImages = (doc: Record<string, unknown>): string[] => {
  const images = [
    ...toImageArray(doc.images),
    ...toImageArray(doc.coverImage),
    ...toImageArray(doc.imageUrl),
    ...toImageArray(doc.imageURL),
    ...toImageArray(doc.image),
  ];

  if (Array.isArray(doc.photos)) {
    images.push(...toImageArray(doc.photos));
  }

  return Array.from(new Set(images.filter(Boolean)));
};

const normalizeTravelDoc = (id: string, doc: Record<string, unknown>) => ({
  id,
  ...doc,
  images: normalizeImages(doc),
});

// GET: Search or list all travel data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get('search') || '').trim().toLowerCase();
    const countryFilter = (searchParams.get('country') || '').trim().toLowerCase();
    const cursor = (searchParams.get('cursor') || '').trim();
    const requestedLimit = Number(searchParams.get('limit') || String(DEFAULT_PUBLIC_LIMIT));
    const pageLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_PUBLIC_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_PUBLIC_LIMIT;

    if (!db) {
      return fail('Database not initialized', 500);
    }

    const startedAt = Date.now();
    const result = await SearchService.searchTravelDestinations({
      query: searchQuery,
      country: countryFilter,
      cursor,
      limit: pageLimit,
    });
    const durationMs = Date.now() - startedAt;
    if (durationMs > SLOW_QUERY_MS) {
      console.warn('[TravelAPI] SLOW_QUERY', {
        route: '/api/travel',
        durationMs,
        docsRead: result.firestoreReads || 0,
        source: result.source,
      });
    }

    return ok({
      results: result.results.map((row: any) => normalizeTravelDoc(String(row.id), row)),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor || null,
      source: result.source,
      latencyMs: result.latencyMs,
      firestoreReads: result.firestoreReads || 0,
    }, 200);
  } catch (error: any) {
    console.error('GET /api/travel error:', error);
    return fail(error.message || 'Failed to fetch travel data', 500);
  }
}

// POST: Create new travel entry
export async function POST(req: NextRequest) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const body = await req.json();
    const { place, country, introduction, itinerary, places, restaurants, hotels, budget, images, coverImage, photoUrl, imageUrl, image, photos, videos, map, overview, durationText, budgetEstimate, travelTips, localInsights, routeFlow, routePoints, generatedBy } = body;

    // Validate required fields
    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const normalizedIntroduction = typeof introduction === 'string' ? introduction.trim() : '';
    const normalizedOverview = typeof overview === 'string' ? overview.trim() : '';

    const normalize = (v: any) =>
      String(v ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const topPlaces = toStringArray(places);
    const placeVal = String(place || '').trim();
    const countryVal = String(country || '').trim();

    const travelData = {
      place: placeVal,
      country: countryVal,
      introduction: normalizedIntroduction || normalizedOverview,
      itinerary: (itinerary || '').trim(),
      places: topPlaces,
      restaurants: toStringArray(restaurants),
      hotels: toStringArray(hotels),
      budget: budget.trim(),
      images: normalizeImages({ images, coverImage, photoUrl, imageUrl, image, photos }),
      videos: Array.isArray(videos) ? videos : [],
      map: map || null,
      overview: normalizedOverview || normalizedIntroduction,
      durationText: typeof durationText === 'string' ? durationText.trim() : '',
      budgetEstimate: typeof budgetEstimate === 'string' ? budgetEstimate.trim() : '',
      travelTips: toStringArray(travelTips),
      localInsights: toStringArray(localInsights),
      routeFlow: typeof routeFlow === 'string' ? routeFlow.trim() : '',
      routePoints: toRoutePoints(routePoints),
      generatedBy: generatedBy === 'gemini' ? 'gemini' : 'system',
      
      // Search fields
      name_lower: normalize(placeVal),
      location_search: normalize([countryVal, placeVal, ...topPlaces].join(" ")),
      location_lower: normalize([placeVal, ...topPlaces, countryVal].join(" ")),

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('travel-destinations').add(travelData);
    await SyncService.syncTravelDestination({ id: docRef.id, ...travelData });
    await SearchService.invalidateSearchCache('travel-destination-created');

    return ok({
      id: docRef.id,
      ...travelData,
    }, 201);
  } catch (error: any) {
    console.error('POST /api/travel error:', error);
    return fail(error.message || 'Failed to create travel data', 500);
  }
}

// DELETE: Bulk delete all travel entries
export async function DELETE(req: NextRequest) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const { searchParams } = new URL(req.url);
    const shouldDeleteAll = searchParams.get('all') === 'true';

    if (!shouldDeleteAll) {
      return fail('Missing required query parameter: all=true', 400);
    }

    const batchSize = 400;
    let deletedCount = 0;
    let cursor: string | null = null;

    while (true) {
      let query = db
        .collection('travel-destinations')
        .orderBy(FieldPath.documentId())
        .limit(batchSize);

      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const batch = db.batch();

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deletedCount += snapshot.size;

      cursor = snapshot.docs[snapshot.docs.length - 1]?.id || cursor;
      if (snapshot.size < batchSize) break;
    }

    return ok({
      deletedCount,
      message: deletedCount === 0 ? 'No itineraries found to delete.' : 'All itineraries deleted successfully.',
    }, 200);
  } catch (error: any) {
    console.error('DELETE /api/travel error:', error);
    return fail(error.message || 'Failed to delete itineraries', 500);
  }
}
