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
  executeScanWithLock,
  CACHE_CONFIG,
} from '@/lib/server/cacheManagement';

export const runtime = 'nodejs';

const COLLECTION = 'travel-destinations';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_SCAN_ROUNDS = 20;

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
    // STRATEGY 3: Cache miss - run scan with lock to prevent stampede
    // =========================================================================
    console.info(`[Admin:Itineraries] CACHE MISS - scanning Firestore`, filters);

    const scanCacheKey = await buildScanCacheKey({
      name: filters.name,
      location: filters.location,
      status: 'all',
    });

    // Try to execute scan with lock
    const collected = await executeScanWithLock(scanCacheKey, async () => {
      const results: ReturnType<typeof normalizeTravelItem>[] = [];
      let scanCursor: FirebaseFirestore.DocumentSnapshot | null = null;
      let round = 0;

      while (results.length < CACHE_CONFIG.MAX_CACHED_SCAN_SIZE && round < MAX_SCAN_ROUNDS) {
        let queryRef = adminDb
          .collection(COLLECTION)
          .orderBy(FieldPath.documentId())
          .limit(Math.max(limit * 2, 50));

        if (scanCursor) {
          queryRef = queryRef.startAfter(scanCursor);
        }

        const snapshot = await queryRef.get();
        if (snapshot.empty) break;

        snapshot.docs.forEach((doc) => {
          if (results.length >= CACHE_CONFIG.MAX_CACHED_SCAN_SIZE) return;
          const item = normalizeTravelItem(doc);

          // Match against normalized filters
          const matchesSearch = filters.name === 'all'
            ? true
            : [item.place, item.country, item.itinerary, item.introduction]
                .join(' ')
                .toLowerCase()
                .includes(filters.name);
          const matchesCountry = filters.location === 'all'
            ? true
            : item.country.toLowerCase().includes(filters.location);

          if (matchesSearch && matchesCountry) {
            results.push(item);
          }
        });

        scanCursor = snapshot.docs[snapshot.docs.length - 1] || null;
        round += 1;
      }

      console.info(`[Admin:Itineraries] Scan completed`, {
        resultsCount: results.length,
        rounds: round,
        maxCached: CACHE_CONFIG.MAX_CACHED_SCAN_SIZE,
      });

      return results;
    });

    // If scan lock was held, return fallback (no stale cache)
    if (collected === null) {
      console.warn(`[Admin:Itineraries] Scan lock held, returning empty result`);
      return ok({
        rows: [],
        hasMore: false,
        nextCursor: null,
        cacheStatus: 'miss',
        scanCacheHit: false,
      });
    }

    // Cache the full scan result
    await cacheScanResults(scanCacheKey, collected, CACHE_CONFIG.SCAN_CACHE_TTL);

    // Paginate the collected results
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const rows = collected.slice(startIdx, endIdx);
    const pageHasMore = endIdx < collected.length;
    const nextCursor = pageHasMore ? String(page + 1) : null;

    // Also cache this specific page for next time
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