import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminDb as db } from '@/lib/server/firebaseAdminFirestore';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const getRouteId = async (context: RouteContext): Promise<string> => {
  const resolvedParams = await Promise.resolve(context.params);
  return typeof resolvedParams?.id === 'string' ? resolvedParams.id.trim() : '';
};

// PUT: Update travel entry
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const id = await getRouteId(context);
    if (!id) {
      return fail('Invalid itinerary id', 400);
    }

    const body = await req.json();
    const { place, country, introduction, itinerary, places, restaurants, hotels, budget, images, videos, map, overview, durationText, budgetEstimate, travelTips, localInsights, routeFlow, routePoints, generatedBy } = body;

    // Validate required fields
    if (!place || !country || !budget) {
      return fail('Missing required fields: place, country, budget', 400);
    }

    const normalizedIntroduction = typeof introduction === 'string' ? introduction.trim() : '';
    const normalizedOverview = typeof overview === 'string' ? overview.trim() : '';

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

    const updateData = {
      place: place.trim(),
      country: country.trim(),
      introduction: normalizedIntroduction || normalizedOverview,
      itinerary: (itinerary || '').trim(),
      places: toStringArray(places),
      restaurants: toStringArray(restaurants),
      hotels: toStringArray(hotels),
      budget: budget.trim(),
      images: Array.isArray(images) ? images : [],
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
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    if (!db) {
      return fail('Database not initialized', 500);
    }

    const id = await getRouteId(context);
    if (!id) {
      return fail('Invalid itinerary id', 400);
    }

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
