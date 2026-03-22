import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdmin';

// PUT: Update travel entry
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const { id } = params;
    const body = await req.json();
    const { place, country, itinerary, places, restaurants, hotels, budget, images, videos, map } = body;

    // Validate required fields
    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const updateData = {
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
      updatedAt: new Date().toISOString(),
    };

    await db.collection('travel-destinations').doc(id).update(updateData);

    return ok({
      id,
      ...updateData,
    }, 200);
  } catch (error: any) {
    console.error('PUT /api/travel/[id] error:', error);
    return fail(error.message || 'Failed to update travel data', 500);
  }
}

// DELETE: Delete travel entry
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const { id } = params;

    // Check if document exists
    const doc = await db.collection('travel-destinations').doc(id).get();
    if (!doc.exists) {
      return fail('Travel entry not found', 404);
    }

    await db.collection('travel-destinations').doc(id).delete();

    return ok({ message: 'Travel entry deleted successfully' }, 200);
  } catch (error: any) {
    console.error('DELETE /api/travel/[id] error:', error);
    return fail(error.message || 'Failed to delete travel data', 500);
  }
}
