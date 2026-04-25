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
    const { place, country, introduction, itinerary, places, restaurants, hotels, budget, images, videos, map, routePoints } = body;

    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const normalize = (v: any) =>
      String(v ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const travelItinerary = {
      place: String(place).trim(),
      country: String(country).trim(),
      introduction: String(introduction || '').trim(),
      itinerary: String(itinerary || '').trim(),
      places: Array.isArray(places) ? places : [],
      restaurants: Array.isArray(restaurants) ? restaurants : [],
      hotels: Array.isArray(hotels) ? hotels : [],
      budget: String(budget).trim(),
      images: Array.isArray(images) ? images : [],
      videos: Array.isArray(videos) ? videos : [],
      map: map || null,
      routePoints: Array.isArray(routePoints) ? routePoints : [],
      
      // Search fields
      name_lower: normalize(place),
      location_search: normalize([country, place, ...(Array.isArray(places) ? places : [])].join(" ")),
      location_lower: normalize([place, ...(Array.isArray(places) ? places : []), country].join(" ")),

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb.collection('travel-destinations').add(travelItinerary);
    
    // Invalidate cache after create
    await invalidateCacheVersion();

    return ok(
      {
        id: docRef.id,
        ...travelItinerary,
      },
      201,
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to create travel itinerary';
    console.error('[Admin:TravelItineraries:Create] Error:', message);
    return fail(message, 500);
  }
}
