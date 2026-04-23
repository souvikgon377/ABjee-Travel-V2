import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getRedis } from '@/lib/server/redis';

const COLLECTION = 'touristPlaces';
export const SHARED_PLACES_CACHE_KEY = 'places_all_data';
const SHARED_PLACES_LOCK_KEY = 'places_lock';
const LOCK_TTL_SECONDS = 10;

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

export class RedisUnavailableError extends Error {
  constructor(message = 'Redis is unavailable.') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

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
  const snapshot = await adminDb.collection(COLLECTION).get();
  return sortPlaces(snapshot.docs.map((doc) => normalizeDoc(doc)));
};

const requireRedis = () => {
  const redis = getRedis();
  if (!redis) {
    throw new RedisUnavailableError('Redis client is unavailable.');
  }
  return redis;
};

const readPlacesFromRedis = async (): Promise<SharedPlaceRecord[] | null> => {
  const redis = requireRedis();

  try {
    const cached = await redis.get<string>(SHARED_PLACES_CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as { places?: SharedPlaceRecord[] } | SharedPlaceRecord[];
    const places = Array.isArray(parsed) ? parsed : Array.isArray(parsed.places) ? parsed.places : [];
    return places;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[PlacesCache] Failed to read shared cache:', message);
    return null;
  }
};

const writePlacesToRedis = async (places: SharedPlaceRecord[]) => {
  const redis = requireRedis();

  await redis.set(SHARED_PLACES_CACHE_KEY, JSON.stringify({
    updatedAt: new Date().toISOString(),
    count: places.length,
    places,
  }));
};

const isLockActive = async () => {
  const redis = requireRedis();
  const lock = await redis.get<string>(SHARED_PLACES_LOCK_KEY);
  return Boolean(lock);
};

const tryAcquireLock = async () => {
  const redis = requireRedis();
  const result = await redis.set(SHARED_PLACES_LOCK_KEY, '1', { nx: true, ex: LOCK_TTL_SECONDS });
  return result === 'OK' || result === true;
};

const releaseLock = async () => {
  const redis = requireRedis();
  await redis.del(SHARED_PLACES_LOCK_KEY);
};

export const refreshSharedPlacesCache = async () => {
  requireRedis();
  const places = await loadPlacesFromFirestore();
  await writePlacesToRedis(places);

  console.info('[PlacesCache] CACHE UPDATED', {
    count: places.length,
    key: SHARED_PLACES_CACHE_KEY,
  });

  return {
    places,
    cacheStatus: 'miss' as const,
    source: 'firestore' as const,
  };
};

type SharedPlacesCacheResult = {
  places: SharedPlaceRecord[];
  cacheStatus: 'hit' | 'miss' | 'warming';
  source: 'redis' | 'firestore' | 'none';
};

export const getSharedPlacesCache = async (): Promise<SharedPlacesCacheResult> => {
  requireRedis();
  const cached = await readPlacesFromRedis();
  if (cached) {
    console.info('[PlacesCache] CACHE HIT', {
      count: cached.length,
      key: SHARED_PLACES_CACHE_KEY,
    });

    return {
      places: cached,
      cacheStatus: 'hit' as const,
      source: 'redis' as const,
    };
  }

  console.info('[PlacesCache] CACHE MISS', {
    key: SHARED_PLACES_CACHE_KEY,
  });

  if (await isLockActive()) {
    console.info('[PlacesCache] CACHE LOCK ACTIVE', {
      key: SHARED_PLACES_LOCK_KEY,
    });
    return {
      places: [],
      cacheStatus: 'warming',
      source: 'none',
    };
  }

  const acquired = await tryAcquireLock();
  if (!acquired) {
    console.info('[PlacesCache] CACHE LOCK ACTIVE', {
      key: SHARED_PLACES_LOCK_KEY,
    });
    return {
      places: [],
      cacheStatus: 'warming',
      source: 'none',
    };
  }

  try {
    const places = await loadPlacesFromFirestore();
    await writePlacesToRedis(places);
    return {
      places,
      cacheStatus: 'miss',
      source: 'firestore',
    };
  } finally {
    await releaseLock();
  }
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
