import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { hybridGet, hybridInvalidate } from '@/lib/server/hybridCache';

const COLLECTION = 'touristPlaces';
export const SHARED_PLACES_CACHE_KEY = 'places_all';
const SHARED_PLACES_CACHE_TTL_SECONDS = 86_400; // 24 hours

export class RedisUnavailableError extends Error {
  constructor(message = 'Redis is unavailable.') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

export type SharedPlacesStatus = 'all' | 'active' | 'inactive';
export type SharedPlacesContentFilter = 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';

export type SharedPlaceRecord = {
  id: string;
  name: string;
  area: string;
  city: string;
  state: string;
  country: string;
  description: string;
  category: string;
  isActive: boolean;
  googleMapsUrl: string;
  coverImage: string;
  media: unknown[];
  extraInfo: unknown[];
  searchName: string;
  searchArea: string;
  searchState: string;
  searchCountry: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type SharedPlacesFilters = {
  search: string;
  location: string;
  contentFilter: SharedPlacesContentFilter;
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

const normalizeDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot): SharedPlaceRecord => {
  const data = doc.data() as Record<string, unknown>;
  const area = normalizeText(data.area || data.region || data.city);
  const state = normalizeText(data.state || data.province);
  const country = normalizeText(data.country || 'India');

  return {
    id: doc.id,
    name: normalizeText(data.name || 'Unnamed Place'),
    area,
    city: normalizeText(data.city || area),
    state,
    country,
    description: normalizeText(data.description),
    category: normalizeText(data.category || 'Other'),
    isActive: data.isActive !== false,
    googleMapsUrl: normalizeText(data.googleMapsUrl),
    coverImage: normalizeText(data.coverImage),
    media: Array.isArray(data.media) ? data.media : [],
    extraInfo: Array.isArray(data.extraInfo) ? data.extraInfo : [],
    searchName: normalizeText(data.searchName),
    searchArea: normalizeText(data.searchArea),
    searchState: normalizeText(data.searchState),
    searchCountry: normalizeText(data.searchCountry),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeSharedPlacesFilters = (filters: Partial<SharedPlacesFilters>): SharedPlacesFilters => {
  const search = normalizeSearchText(String(filters.search ?? ''));
  const location = normalizeSearchText(String(filters.location ?? ''));
  const contentFilter =
    filters.contentFilter === 'photos-added' ||
    filters.contentFilter === 'photos-not-added' ||
    filters.contentFilter === 'recently-updated'
      ? filters.contentFilter
      : 'all';

  return { search, location, contentFilter };
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null) {
    const timestampLike = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof timestampLike.toDate === 'function') return timestampLike.toDate().getTime();
    if (typeof timestampLike.seconds === 'number') return (timestampLike.seconds * 1000) + Math.floor((timestampLike.nanoseconds ?? 0) / 1_000_000);
  }
  return 0;
};

export const matchesSharedPlaceFilters = (place: SharedPlaceRecord, filters: SharedPlacesFilters) => {
  const hasPhotos = (place.media?.length || 0) > 0 || Boolean(place.coverImage);
  const updatedAtValue = toMillis(place.updatedAt);

  if (filters.contentFilter === 'photos-added' && !hasPhotos) return false;
  if (filters.contentFilter === 'photos-not-added' && hasPhotos) return false;
  if (filters.contentFilter === 'recently-updated') {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (!updatedAtValue || updatedAtValue < sevenDaysAgo) return false;
  }

  if (filters.search) {
    const haystack = [place.name, place.searchName].filter(Boolean).join(' ').toLowerCase();
    const tokens = filters.search.split(' ').filter(Boolean);
    const phraseMatch = haystack.includes(filters.search);
    const tokenMatch = tokens.length > 0 && tokens.every((token) => haystack.includes(token));

    if (!phraseMatch && !tokenMatch) return false;
  }

  if (filters.location) {
    const locationHaystack = [place.area, place.city, place.state, place.country].filter(Boolean).join(' ').toLowerCase();
    if (!locationHaystack.includes(filters.location)) return false;
  }

  return true;
};

const sortPlaces = (places: SharedPlaceRecord[]) => {
  return [...places].sort((left, right) => {
    const leftUpdated = toMillis(left.updatedAt);
    const rightUpdated = toMillis(right.updatedAt);

    if (leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }

    return left.name.localeCompare(right.name);
  });
};

const loadPlacesFromFirestore = async (): Promise<SharedPlaceRecord[]> => {
  console.info('[PlacesCache] FETCHING FROM FIRESTORE');
  const snapshot = await adminDb.collection(COLLECTION).get();
  return sortPlaces(snapshot.docs.map((doc) => normalizeDoc(doc)));
};

/**
 * Migration to hybridCache:
 * This eliminates the [object Object] serialization bug and redundant locking logic.
 */

export const getSharedPlacesCache = async (): Promise<{
  places: SharedPlaceRecord[];
  cacheStatus: 'hit' | 'miss' | 'warming';
  source: 'hybrid' | 'firestore';
}> => {
  const places = await hybridGet<SharedPlaceRecord[]>(
    SHARED_PLACES_CACHE_KEY,
    loadPlacesFromFirestore,
    { 
      redisTtlSeconds: SHARED_PLACES_CACHE_TTL_SECONDS,
      memoryTtlSeconds: 300 // 5 minutes L1
    }
  );

  return {
    places,
    cacheStatus: 'hit', // Simplified status for legacy compatibility
    source: 'hybrid'
  };
};

export const refreshSharedPlacesCache = async () => {
  await hybridInvalidate(SHARED_PLACES_CACHE_KEY);
  
  // Re-fetch to warm it up
  const places = await hybridGet<SharedPlaceRecord[]>(
    SHARED_PLACES_CACHE_KEY,
    loadPlacesFromFirestore,
    { redisTtlSeconds: SHARED_PLACES_CACHE_TTL_SECONDS }
  );

  console.info('[PlacesCache] CACHE REFRESHED', { count: places.length });

  return {
    places,
    cacheStatus: 'miss' as const,
    source: 'firestore' as const,
  };
};

export const filterSharedPlaces = (
  places: SharedPlaceRecord[],
  filters: SharedPlacesFilters,
) => {
  return places.filter((place) => matchesSharedPlaceFilters(place, filters));
};

export const paginateSharedPlaces = <T>(places: T[], page: number, limit: number) => {
  const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
  const safeLimit = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 20);
  const start = (safePage - 1) * safeLimit;
  const end = start + safeLimit;

  return {
    rows: places.slice(start, end),
    hasMore: end < places.length,
    nextPage: end < places.length ? safePage + 1 : null,
  };
};
