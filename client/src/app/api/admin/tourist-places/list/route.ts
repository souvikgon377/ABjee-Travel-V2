import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { SearchService } from '@/modules/search/SearchService';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { enrichTouristPlacesFromFirestore } from '@/lib/server/touristPlaceHydration';
import { hasTouristPlacePhotos } from '@/lib/touristPlaceMedia';

export const runtime = 'nodejs';

const toMillis = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toDate === 'function') return candidate.toDate().getTime();
    if (typeof candidate.seconds === 'number') {
      return (candidate.seconds * 1000) + Math.floor((candidate.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
};

const compareTouristPlaces = (left: any, right: any) => {
  const leftPopularity = Number(left?.popularity ?? 0);
  const rightPopularity = Number(right?.popularity ?? 0);
  if (leftPopularity !== rightPopularity) {
    return rightPopularity - leftPopularity;
  }

  const leftUpdatedAt = toMillis(left?.updatedAt ?? left?.createdAt);
  const rightUpdatedAt = toMillis(right?.updatedAt ?? right?.createdAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return String(left?.name || '').localeCompare(String(right?.name || ''));
};

const matchesContentFilter = (place: any, filter: string) => {
  if (filter === 'photos-added') return hasTouristPlacePhotos(place);
  if (filter === 'photos-not-added') return !hasTouristPlacePhotos(place);
  if (filter === 'recently-updated') {
    const updatedAt = toMillis(place?.updatedAt);
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    return Boolean(updatedAt && updatedAt >= sevenDaysAgo);
  }
  return true;
};

/**
 * GET /api/admin/tourist-places/list
 * 
 * Admin list view for tourist places. Powered by Typesense.
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const location = searchParams.get('location') || '';
    const filter = searchParams.get('filter') || 'all';
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '30')));
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

    // Admin convenience: return all places when `?all=true` is provided.
    const hasSearchConstraints = Boolean(search.trim() || location.trim() || filter !== 'all');
    if (searchParams.get('all') === 'true' && !hasSearchConstraints) {
      console.warn('[Admin:TouristPlaces:List] Returning ALL places for admin request (unpaginated).');
      // ⚡ OPTIMIZATION: Add safety limit to prevent full collection scan overhead
      const snap = await adminDb
        .collection('touristPlaces')
        .limit(5000)  // Safety cap - most collections << 5000 docs
        .get();
      const rows = snap.docs
        .map((d: any) => ({ id: d.id, ...d.data() }))
        .sort(compareTouristPlaces);

      return ok({
        data: rows,
        rows,
        total: rows.length,
        totalCount: rows.length,
        page: 1,
        hasMore: snap.size >= 5000,  // Indicate if more docs exist beyond limit
        source: 'firestore_all',
      });
    }

    if (filter === 'requested') {
      const snap = await adminDb
        .collection('touristPlaces')
        .where('isRequested', '==', true)
        .get();
      let rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      // Apply search & location filter in memory
      if (search.trim()) {
        const normSearch = search.toLowerCase();
        rows = rows.filter((r: any) => String(r.name || '').toLowerCase().includes(normSearch));
      }
      if (location.trim()) {
        const normLoc = location.toLowerCase();
        rows = rows.filter((r: any) => 
          [r.city, r.area, r.state, r.country]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normLoc)
        );
      }

      rows.sort(compareTouristPlaces);
      const paginated = rows.slice((page - 1) * limit, page * limit);

      return ok({
        data: paginated,
        rows: paginated,
        total: rows.length,
        totalCount: rows.length,
        page,
        hasMore: (page * limit) < rows.length,
        source: 'firestore_requested',
      });
    }


    // Admin photo-status counts must be an exact partition of the collection.
    // Typesense can exclude documents where optional mediaCount is missing, so use
    // the same shared photo helper against Firestore rows for these browse filters.


    const result = await SearchService.searchPlaces({
      query: search,
      location,
      category: 'all',
      contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
      page,
      limit,
      forceRefresh,
      isActive: undefined,
      // Admin sees everything (both active and inactive), so we don't filter by isActive
    });

    const enrichedResults = await enrichTouristPlacesFromFirestore(result.results);

    return ok({
      data: enrichedResults,
      rows: enrichedResults,
      total: result.totalCount,
      totalCount: result.totalCount,
      page,
      hasMore: result.hasMore,
      source: result.source,
      latencyMs: result.latencyMs,
      firestoreReads: result.firestoreReads || 0,
    });

  } catch (error: any) {
    console.error('[Admin:TouristPlaces:List] GET Error:', error);
    return fail("Failed to load places.", 500);
  }
}
