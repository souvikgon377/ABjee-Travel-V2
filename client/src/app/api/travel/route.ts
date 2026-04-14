import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdminFirestore';

interface TravelDestinationDoc {
  place?: string;
  country?: string;
  [key: string]: unknown;
}

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

// GET: Search or list all travel data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get('search');

    if (!db) {
      return fail('Database not initialized', 500);
    }

    let query = db.collection('travel-destinations');

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const snapshot = await query.get();
      
      const results = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...(doc.data() as TravelDestinationDoc),
        }))
        .filter((doc: TravelDestinationDoc) => {
          const place = (doc.place || '').toLowerCase();
          const country = (doc.country || '').toLowerCase();
          return place.includes(q) || country.includes(q);
        });

      return ok({ results }, 200);
    }

    // Return all documents if no search query
    const snapshot = await query.get();
    const results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return ok({ results }, 200);
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
    const { place, country, itinerary, places, restaurants, hotels, budget, images, videos, map, overview, durationText, budgetEstimate, travelTips, localInsights, routeFlow, routePoints, generatedBy } = body;

    // Validate required fields
    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const travelData = {
      place: place.trim(),
      country: country.trim(),
      itinerary: (itinerary || '').trim(),
      places: toStringArray(places),
      restaurants: toStringArray(restaurants),
      hotels: toStringArray(hotels),
      budget: budget.trim(),
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      map: map || null,
      overview: typeof overview === 'string' ? overview.trim() : '',
      durationText: typeof durationText === 'string' ? durationText.trim() : '',
      budgetEstimate: typeof budgetEstimate === 'string' ? budgetEstimate.trim() : '',
      travelTips: toStringArray(travelTips),
      localInsights: toStringArray(localInsights),
      routeFlow: typeof routeFlow === 'string' ? routeFlow.trim() : '',
      routePoints: toRoutePoints(routePoints),
      generatedBy: generatedBy === 'gemini' ? 'gemini' : 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('travel-destinations').add(travelData);

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

    const snapshot = await db.collection('travel-destinations').get();
    if (snapshot.empty) {
      return ok({ deletedCount: 0, message: 'No itineraries found to delete.' }, 200);
    }

    const docs = snapshot.docs;
    const batchSize = 400;
    let deletedCount = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);

      chunk.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      deletedCount += chunk.length;
    }

    return ok({ deletedCount, message: 'All itineraries deleted successfully.' }, 200);
  } catch (error: any) {
    console.error('DELETE /api/travel error:', error);
    return fail(error.message || 'Failed to delete itineraries', 500);
  }
}
