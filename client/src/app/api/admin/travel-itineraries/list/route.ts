import { NextRequest } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import {
  validateAndNormalizeFilters,
  buildPageCacheKey,
  buildScanCacheKey,
  getFromCache,
  setInCache,
  getCachedScanResults,
  cacheScanResults,
  CACHE_CONFIG,
} from '@/lib/server/cacheManagement';

export const runtime = 'nodejs';

const COLLECTION = 'travel-destinations';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_SCAN_ROUNDS = 4;
const SCAN_BATCH_SIZE = 50;

const normalizeText = (value: string) => value.trim();


const normalizeTravelItem = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  const t = doc.data() as Record<string, unknown>;

  return {
    id: doc.id,
    place: String(t.place || ''),
    country: String(t.country || ''),
    introduction: String(t.introduction || ''),
    itinerary: String(t.itinerary || ''),
    routePoints: Array.isArray(t.routePoints) ? t.routePoints : [],
    restaurants: Array.isArray(t.restaurants) ? t.restaurants : [],
    hotels: Array.isArray(t.hotels) ? t.hotels : [],
    budget: String(t.budget || ''),
    createdAt: t.createdAt ?? null,
    updatedAt: t.updatedAt ?? null,
    images: Array.isArray(t.images) ? t.images : [],
    coverImage: String(t.coverImage || ''),
    imageUrl: String(t.imageUrl || ''),
    image: String(t.image || ''),
    photos: Array.isArray(t.photos) ? t.photos : [],
    videos: Array.isArray(t.videos) ? t.videos : [],
    map: t.map ?? null,
    places: Array.isArray(t.places) ? t.places : [],
  };
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const params = req.nextUrl.searchParams;
    const rawSearch = normalizeText(params.get('search') || '');
    const rawCountry = normalizeText(params.get('country') || '');
    const page = Math.max(1, Number(params.get('page') || '1'));
    const forceRefresh = params.get('forceRefresh') === 'true';
    const requestedLimit = Number(params.get('limit') || String(DEFAULT_LIMIT));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_LIMIT;

    // CRITICAL: Validate and normalize all filter inputs
    const filters = validateAndNormalizeFilters({
      name: rawSearch,
      location: rawCountry,
      status: 'all',
    });

    console.info('[Admin:Itineraries] Request:', {
      page,
      limit,
      forceRefresh,
      filters,
    });

    const hasActiveFilters = Boolean(filters.name !== 'all' || filters.location !== 'all');

    // =========================================================================
    // STRATEGY 1: Check page cache first (for non-force-refresh requests)
    // =========================================================================
    if (!forceRefresh) {
      const pageCacheKey = await buildPageCacheKey({
        name: filters.name,
        location: filters.location,
        status: 'all',
        page,
      });

      const cached = await getFromCache<{
        rows: ReturnType<typeof normalizeTravelItem>[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(pageCacheKey);

      if (cached) {
        console.info(`[Admin:Itineraries] PAGE CACHE HIT`, { page, filters });
        return ok({ ...cached, cacheStatus: 'hit', scanCacheHit: false });
      }

      // =========================================================================
      // STRATEGY 2: For filtered requests, try scan cache
      // =========================================================================
      if (hasActiveFilters) {
        const scanCacheKey = await buildScanCacheKey({
          name: filters.name,
          location: filters.location,
          status: 'all',
        });

        const cachedScan = await getCachedScanResults<ReturnType<typeof normalizeTravelItem>>(
          scanCacheKey,
        );

        if (cachedScan) {
          // Scan cache hit - slice for this page
          const startIdx = (page - 1) * limit;
          const endIdx = startIdx + limit;
          const pageItems = cachedScan.slice(startIdx, endIdx);
          const hasMore = endIdx < cachedScan.length;

          console.info(`[Admin:Itineraries] Paginating from SCAN CACHE`, {
            page,
            limit,
            scanSize: cachedScan.length,
            pageSize: pageItems.length,
          });

          return ok({
            rows: pageItems,
            hasMore,
            nextCursor: hasMore ? String(page + 1) : null,
            cacheStatus: 'hit',
            scanCacheHit: true,
          });
        }
      }
    }

    // =========================================================================
    // STRATEGY 3: Cache miss - run prefix queries
    // =========================================================================
    console.info(`[Admin:Itineraries] CACHE MISS - running Firestore queries`, filters);

    const runPrefixQuery = async (field: string, search: string) => {
      const snap = await adminDb
        .collection(COLLECTION)
        .orderBy(field)
        .orderBy(FieldPath.documentId())
        .startAt(search)
        .endAt(search + '\uf8ff')
        .offset((page - 1) * limit)
        .limit(limit)
        .get();
      
      return snap.docs.map(normalizeTravelItem);
    };

    let collected: ReturnType<typeof normalizeTravelItem>[] = [];

    if (filters.name !== 'all') {
      const search = filters.name.toLowerCase().trim();
      const preferLocation = !search.includes(' ');

      if (preferLocation) {
        // Try country/global first
        collected = await runPrefixQuery('location_search', search);
        if (collected.length === 0) {
          // Try local fallback
          collected = await runPrefixQuery('location_lower', search);
        }
      } else {
        // Multi-word: try name first
        collected = await runPrefixQuery('name_lower', search);
        if (collected.length === 0) {
          collected = await runPrefixQuery('location_search', search);
        }
      }
    } else if (filters.location !== 'all') {
      // Just country filter
      collected = await runPrefixQuery('location_search', filters.location.toLowerCase().trim());
    } else {
      // No search/filter: list by creation date (newest first)
      const snap = await adminDb
        .collection(COLLECTION)
        .orderBy('createdAt', 'desc')
        .offset((page - 1) * limit)
        .limit(limit)
        .get();
      collected = snap.docs.map(normalizeTravelItem);
    }

    console.info(`[Admin:Itineraries] Query completed`, {
      resultsCount: collected.length,
      strategy: filters.name !== 'all' ? 'prefix' : 'list',
    });

    // Cache the scan result (even if it's just a prefix query result)
    const scanCacheKey = await buildScanCacheKey({
      name: filters.name,
      location: filters.location,
      status: 'all',
    });
    await cacheScanResults(scanCacheKey, collected, CACHE_CONFIG.SCAN_CACHE_TTL);

    // Paginate (though prefix query already limits, we slice for consistency with cache logic)
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    
    // If we fetched directly from Firestore with limit/offset, 'collected' already contains the target page items.
    // However, the prefix queries above fetch only 'limit' items starting at offset.
    // So 'collected' is actually our target page.
    const rows = collected; 
    const pageHasMore = collected.length === limit;
    const nextCursor = pageHasMore ? String(page + 1) : null;

    // Cache this specific page
    const pageCacheKey = await buildPageCacheKey({
      name: filters.name,
      location: filters.location,
      status: 'all',
      page,
    });

    await setInCache(
      pageCacheKey,
      { rows, hasMore: pageHasMore, nextCursor },
      CACHE_CONFIG.PAGE_CACHE_TTL,
    );

    return ok({
      rows,
      hasMore: pageHasMore,
      nextCursor,
      cacheStatus: 'miss',
      scanCacheHit: false,
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