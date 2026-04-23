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

const COLLECTION = 'touristPlaces';
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_SCAN_ROUNDS = 20;

type TouristPlacesContentFilter = 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';

const normalizeText = (value: string) => value.trim();


const normalizeTouristPlace = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  const p = doc.data() as Record<string, unknown>;
  const area = String(p.area || p.region || p.city || '').trim();
  const state = String(p.state || p.province || '').trim();
  const country = String(p.country || 'India').trim();
  const media = Array.isArray(p.media) ? p.media : [];
  const extraInfo = Array.isArray(p.extraInfo) ? p.extraInfo : [];

  return {
    id: doc.id,
    name: String(p.name || 'Unnamed Place'),
    area,
    city: String(p.city || area || '').trim(),
    state,
    country,
    description: String(p.description || ''),
    category: String(p.category || 'Other'),
    isActive: p.isActive !== false,
    googleMapsUrl: String(p.googleMapsUrl || ''),
    coverImage: String(p.coverImage || ''),
    media,
    extraInfo,
    searchName: String(p.searchName || '').trim(),
    searchArea: String(p.searchArea || '').trim(),
    searchState: String(p.searchState || '').trim(),
    searchCountry: String(p.searchCountry || '').trim(),
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
  };
};

const matchesFilters = (place: ReturnType<typeof normalizeTouristPlace>, filters: { name: string; location: string; contentFilter: TouristPlacesContentFilter }) => {
  const hasPhotos = (place.media?.length || 0) > 0 || Boolean(place.coverImage);
  const updatedAtValue = place.updatedAt instanceof Date
    ? place.updatedAt.getTime()
    : place.updatedAt && typeof place.updatedAt === 'object' && 'toDate' in place.updatedAt
      ? (place.updatedAt as { toDate: () => Date }).toDate().getTime()
      : 0;

  if (filters.contentFilter === 'photos-added' && !hasPhotos) return false;
  if (filters.contentFilter === 'photos-not-added' && hasPhotos) return false;
  if (filters.contentFilter === 'recently-updated') {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (!updatedAtValue || updatedAtValue < sevenDaysAgo) return false;
  }

  // Only apply search filter if it's not "all" (normalized empty value)
  if (filters.name && filters.name !== 'all') {
    const searchTokens = filters.name.split(/\s+/).filter(Boolean);
    const haystack = [
      place.name,
      place.searchName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const phraseMatch = haystack.includes(filters.name);
    const tokenMatch = searchTokens.length > 0 && searchTokens.every((token) => haystack.includes(token));

    if (!phraseMatch && !tokenMatch) return false;
  }

  // Only apply location filter if it's not "all" (normalized empty value)
  if (filters.location && filters.location !== 'all') {
    const haystack = [place.city, place.area, place.state, place.country].filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(filters.location)) return false;
  }

  return true;
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const params = req.nextUrl.searchParams;
    const rawSearch = normalizeText(params.get('search') || '');
    const rawLocation = normalizeText(params.get('location') || '');
    const rawContentFilter = (params.get('filter') || 'all') as TouristPlacesContentFilter;
    const page = Math.max(1, Number(params.get('page') || '1'));
    const forceRefresh = params.get('forceRefresh') === 'true';
    const requestedLimit = Number(params.get('limit') || String(DEFAULT_LIMIT));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_LIMIT;

    // CRITICAL: Validate and normalize all filter inputs
    const filters = validateAndNormalizeFilters({
      name: rawSearch,
      location: rawLocation,
      status: 'all',
    });
    const contentFilter = rawContentFilter === 'photos-added' || rawContentFilter === 'photos-not-added' || rawContentFilter === 'recently-updated'
      ? rawContentFilter
      : 'all';

    console.info('[Admin:Places] Request:', {
      page,
      limit,
      forceRefresh,
      filters,
      contentFilter,
    });

    const hasActiveFilters = Boolean(filters.name !== 'all' || filters.location !== 'all' || contentFilter !== 'all');

    // =========================================================================
    // STRATEGY 1: Check page cache first (for non-force-refresh requests)
    // =========================================================================
    if (!forceRefresh) {
      const pageCacheKey = await buildPageCacheKey({
        name: filters.name,
        location: filters.location,
        contentFilter,
        page,
      });

      const cached = await getFromCache<{
        rows: ReturnType<typeof normalizeTouristPlace>[];
        hasMore: boolean;
        nextCursor: string | null;
      }>(pageCacheKey);

      if (cached) {
        console.info(`[Admin:Places] PAGE CACHE HIT`, { page, filters });
        return ok({ ...cached, cacheStatus: 'hit', scanCacheHit: false });
      }

      // =========================================================================
      // STRATEGY 2: For filtered requests, try scan cache
      // =========================================================================
      if (hasActiveFilters) {
        const scanCacheKey = await buildScanCacheKey({
          name: filters.name,
          location: filters.location,
          contentFilter,
        });

        const cachedScan = await getCachedScanResults<ReturnType<typeof normalizeTouristPlace>>(
          scanCacheKey,
        );

        if (cachedScan) {
          // Scan cache hit - slice for this page
          const startIdx = (page - 1) * limit;
          const endIdx = startIdx + limit;
          const pageItems = cachedScan.slice(startIdx, endIdx);
          const hasMore = endIdx < cachedScan.length;

          console.info(`[Admin:Places] Paginating from SCAN CACHE`, {
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
    console.info(`[Admin:Places] CACHE MISS - scanning Firestore`, filters);

    const scanCacheKey = await buildScanCacheKey({
      name: filters.name,
      location: filters.location,
      contentFilter,
    });

    // Try to execute scan with lock
    const collected = await executeScanWithLock(scanCacheKey, async () => {
      const results: ReturnType<typeof normalizeTouristPlace>[] = [];
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
          const place = normalizeTouristPlace(doc);
          if (matchesFilters(place, { ...filters, contentFilter })) {
            results.push(place);
          }
        });

        scanCursor = snapshot.docs[snapshot.docs.length - 1] || null;
        round += 1;
      }

      console.info(`[Admin:Places] Scan completed`, {
        resultsCount: results.length,
        rounds: round,
        maxCached: CACHE_CONFIG.MAX_CACHED_SCAN_SIZE,
      });

      return results;
    });

    // If scan lock was held, return fallback (no stale cache)
    if (collected === null) {
      console.warn(`[Admin:Places] Scan lock held, returning empty result`);
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
        contentFilter,
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

    const message = error instanceof Error ? error.message : 'Failed to load tourist places';
    console.error('[Admin:Places] Error:', message, error);
    return fail(message, 500);
  }
}