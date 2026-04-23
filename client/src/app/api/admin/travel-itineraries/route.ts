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
    const { place, country, introduction, itinerary, places, restaurants, hotels, budget, images, videos, map, routePoints } = body;

    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const docRef = adminDb.collection('travel-destinations').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Travel itinerary not found', 404);
    }

    const updateData = {
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

    const message = error instanceof Error ? error.message : 'Failed to update travel itinerary';
    console.error('[Admin:TravelItineraries:Update] Error:', message);
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

    const docRef = adminDb.collection('travel-destinations').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Travel itinerary not found', 404);
    }

    await docRef.delete();
    
    // Invalidate cache after delete
    await invalidateCacheVersion();

    return ok({ deleted: true, id });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to delete travel itinerary';
    console.error('[Admin:TravelItineraries:Delete] Error:', message);
    return fail(message, 500);
  }
}
