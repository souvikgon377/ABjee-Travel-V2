import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { validateAndNormalizeFilters } from '@/lib/server/cacheManagement';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const normalizeTravelRow = (row: any) => ({
  ...row,
  id: String(row.id || ''),
  place: String(row.place || ''),
  country: String(row.country || ''),
  introduction: String(row.introduction || ''),
  itinerary: String(row.itinerary || ''),
  routePoints: Array.isArray(row.routePoints) ? row.routePoints : [],
  restaurants: Array.isArray(row.restaurants) ? row.restaurants : [],
  hotels: Array.isArray(row.hotels) ? row.hotels : [],
  budget: String(row.budget || ''),
  createdAt: row.createdAt ?? null,
  updatedAt: row.updatedAt ?? null,
  images: Array.isArray(row.images) ? row.images : [],
  coverImage: String(row.coverImage || ''),
  imageUrl: String(row.imageUrl || ''),
  image: String(row.image || ''),
  photos: Array.isArray(row.photos) ? row.photos : [],
  videos: Array.isArray(row.videos) ? row.videos : [],
  map: row.map ?? null,
  places: Array.isArray(row.places) ? row.places : [],
});

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const forceRefresh = params.get('forceRefresh') === 'true';
    const requestedLimit = Number(params.get('limit') || String(DEFAULT_LIMIT));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_LIMIT;

    const filters = validateAndNormalizeFilters({
      name: params.get('search') || '',
      location: params.get('country') || '',
      status: 'all',
    });

    console.info('[Admin:Itineraries] Unified search request', {
      page,
      limit,
      forceRefresh,
      filters,
    });

    const result = await SearchService.searchTravelDestinations({
      query: filters.name === 'all' ? '' : filters.name,
      country: filters.location === 'all' ? '' : filters.location,
      page,
      limit,
      forceRefresh,
    });

    return ok({
      rows: result.results.map(normalizeTravelRow),
      hasMore: result.hasMore,
      nextCursor: result.nextCursor || null,
      cacheStatus: result.fromCache ? 'hit' : 'miss',
      scanCacheHit: result.source === 'memory' || result.source === 'redis',
      source: result.source,
      latencyMs: result.latencyMs,
      firestoreReads: result.firestoreReads || 0,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    const message = error instanceof Error ? error.message : 'Failed to load travel itineraries';
    console.error('[Admin:Itineraries] Error:', message, error);
    return fail(message, 500);
  }
}
