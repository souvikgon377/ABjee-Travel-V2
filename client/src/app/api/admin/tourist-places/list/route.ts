import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminSearch } from '@/lib/server/touristSearchUtils';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

const clampPage = (value: string | null) => {
  const parsed = Number(value || '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(50, Math.floor(parsed));
};

const clampLimit = (value: string | null) => {
  const parsed = Number(value || '30');
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(20, Math.min(50, Math.floor(parsed)));
};

const normalizeQueryParam = (value: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Proxy-safe client IP extraction
 */
function getClientIP(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    // @ts-ignore
    req.ip ||
    "unknown"
  );
}

/**
 * GET /api/admin/tourist-places/list
 * Admin-only protected tourist place search.
 */
async function fallbackFirestoreSearch(params: {
  search: string;
  location: string;
  filter: string;
  page: number;
  limit: number;
}) {
  const startedAt = Date.now();
  try {
    console.warn('[AdminSearchRoute] Redis unavailable, falling back to Firestore query');

    const collectionName = process.env.PLACES_COLLECTION || 'touristPlaces';

    // For simplicity, fetch all places and filter in memory
    // This is not ideal for large datasets, but provides a fallback
    const snap = await adminDb
      .collection(collectionName)
      .orderBy('updatedAt', 'desc')
      .limit(2000) // Broad fetch for reliability during quota fallback
      .get();

    let places = snap.docs.map((doc: any) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>)
    }));

    // Apply filters
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      places = places.filter((p: any) => {
        const searchable = [
          p.name, p.Name,
          p.area, p.Area,
          p.city, p.City,
          p.state, p.State,
          p.country, p.Country,
          p.category, p.Category
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return searchable.includes(searchLower);
      });
    }

    if (params.location) {
      const locLower = params.location.toLowerCase();
      places = places.filter((p: any) => {
        const searchable = [
          p.area, p.Area,
          p.city, p.City,
          p.state, p.State,
          p.country, p.Country
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return searchable.includes(locLower);
      });
    }

    if (params.filter === 'photos-added' || params.filter === 'photos-not-added') {
      places = places.filter((p: any) => {
        const hasPhotos = Boolean(p.coverImage) || (Array.isArray(p.media) && p.media.length > 0);
        return params.filter === 'photos-added' ? hasPhotos : !hasPhotos;
      });
    } else if (params.filter === 'recently-updated') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      places = places.filter((p: any) => {
        const updatedAt = p.updatedAt;
        let millis = 0;
        if (updatedAt && typeof updatedAt.toDate === 'function') millis = updatedAt.toDate().getTime();
        else if (updatedAt instanceof Date) millis = updatedAt.getTime();
        else if (typeof updatedAt === 'number') millis = updatedAt;
        return millis >= sevenDaysAgo;
      });
    }

    // Paginate
    const start = (params.page - 1) * params.limit;
    const pageItems = places.slice(start, start + params.limit);
    const hasMore = start + params.limit < places.length;

    return {
      data: pageItems,
      rows: pageItems,
      total: places.length,
      totalCount: places.length,
      page: params.page,
      hasMore,
      source: 'firestore-fallback',
      cacheStatus: 'error',
      queryName: 'firestore-fallback',
      docsReturned: pageItems.length,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    console.error('[AdminSearchRoute] Firestore fallback failed:', err);
    // Return empty results rather than throwing
    return {
      data: [],
      rows: [],
      total: 0,
      totalCount: 0,
      page: params.page,
      hasMore: false,
      source: 'fallback-error',
      cacheStatus: 'error',
      queryName: 'fallback-error',
      docsReturned: 0,
      latencyMs: Date.now() - startedAt,
      error: 'Failed to load data. Please try again.',
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = normalizeQueryParam(searchParams.get('search'));
    const location = normalizeQueryParam(searchParams.get('location'));
    const filter = searchParams.get('filter') || 'all';
    const page = clampPage(searchParams.get('page'));
    const limit = clampLimit(searchParams.get('limit'));

    console.info('[AdminSearchRoute] API_CALL', {
      search,
      location,
      filter,
      page,
      limit,
    });

    // 1. Route-level guard (short-circuit trivial queries)
    if ((search.length > 0 && search.length < 2) || (location.length > 0 && location.length < 2)) {
      return ok({
        data: [],
        rows: [],
        total: 0,
        totalCount: 0,
        page,
        hasMore: false,
        source: 'short-circuit',
        cacheStatus: 'hit',
        queryName: 'short-circuit',
        docsReturned: 0,
      });
    }

    // 2. Try Redis search first, fall back to Firestore if it fails
    let results;
    try {
      results = await adminSearch({
        search,
        location,
        filter,
        page,
        limit,
        ip: getClientIP(req)
      });
    } catch (redisError: any) {
      console.error('[AdminSearchRoute] Redis search failed:', redisError.message);
      // Fall back to Firestore
      results = await fallbackFirestoreSearch({ search, location, filter, page, limit });
    }

    console.info('[AdminSearchRoute] RESULT', {
      queryName: `redis-index:${results.source}`,
      cacheStatus: results.cacheStatus,
      docsReturned: results.data.length,
      latencyMs: results.latencyMs,
    });

    return ok({
      ...results,
      rows: results.data,
      totalCount: results.total,
      queryName: `redis-index:${results.source}`,
      docsReturned: results.data.length,
    });
  } catch (error: any) {
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      return fail("Too many requests. Please wait 10 seconds.", 429);
    }
    console.error('[AdminSearchRoute] ERROR:', error);
    // Return empty results instead of 500
    return ok({
      data: [],
      rows: [],
      total: 0,
      totalCount: 0,
      page: 1,
      hasMore: false,
      source: 'error',
      cacheStatus: 'error',
      queryName: 'error-fallback',
      docsReturned: 0,
      error: 'Failed to load tourist places. Please try again.',
    });
  }
}
