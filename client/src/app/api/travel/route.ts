import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdminFirestore';

interface TravelDestinationDoc {
  place?: string;
  country?: string;
  [key: string]: unknown;
}

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
    const { place, country, itinerary, places, restaurants, hotels, budget, images, videos, map } = body;

    // Validate required fields
    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const travelData = {
      place: place.trim(),
      country: country.trim(),
      itinerary: (itinerary || '').trim(),
      places: Array.isArray(places) ? places.filter((p: string) => p.trim()) : [],
      restaurants: Array.isArray(restaurants) ? restaurants.filter((r: string) => r.trim()) : [],
      hotels: Array.isArray(hotels) ? hotels.filter((h: string) => h.trim()) : [],
      budget: budget.trim(),
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      map: map || null,
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
