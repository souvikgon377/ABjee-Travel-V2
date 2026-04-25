import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';
import { getRedis } from '@/lib/server/redis';
import { adminSearch } from '@/lib/server/touristSearchUtils';
import { getCacheVersion } from '@/lib/server/cacheManagement';

export const runtime = 'nodejs';

const COLLECTION = process.env.PLACES_COLLECTION || 'touristPlaces';
const CACHE_TTL_SECONDS = 86400; // 24 hours (Stale limit)
const FRESH_TTL_SECONDS = 3600; // 1 hour (Stale threshold)
const EMPTY_CACHE_TTL_SECONDS = 600;
const LOCK_TTL_SECONDS = 8;
const CURSOR_TTL_MS = 60 * 60 * 1000;
const MIN_SEARCH_LENGTH = 2;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;
const LOCATION_HEURISTIC_MAX_LEN = 16;
const CURSOR_SECRET_FALLBACK = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.JWT_SECRET || '';
const SLOW_QUERY_MS = 200;
const L1_CACHE_TTL_MS = 10_000; // 10 seconds L1 cache for ultra-hot keys
const L1_CACHE = new Map<string, { payload: PlacesPayload; expiresAt: number }>();

const logMetrics = (event: string, data: Record<string, unknown>) => {
  console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data,
  }));
};

type PlaceRow = {
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
  createdAt: unknown;
  updatedAt: unknown;
};

type PlacesPayload = {
  rows: PlaceRow[];
  results: PlaceRow[];
  hasMore: boolean;
  lastDoc: string | null;
  totalCount: number;
  cacheStatus: 'hit' | 'miss' | 'stale';
  queryName: string;
  docsReturned: number;
  etag?: string;
};

type CacheEnvelope = {
  payload: PlacesPayload;
  savedAt: number;
  staleAt: number;
};

const inFlight = new Map<string, Promise<PlacesPayload>>();
const apiFrequency = new Map<string, { count: number; resetAt: number }>();

type CursorToken = {
  docId: string;
  lastValue: string;
  queryHash: string;
};

type SignedCursorToken = {
  payload: string;
  signature: string;
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clampLimit = (value: string | null) => {
  if (value === null || value === '') return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
};

const getCursorSecret = () => process.env.PLACES_CURSOR_SECRET || CURSOR_SECRET_FALLBACK;

const getCursorQueryHash = (search: string, location: string, filter: string, limit: number) =>
  createHash('sha256').update([search || '_', location || '_', filter || '_', String(limit)].join('|')).digest('base64url');

const logCursorValidationFail = (reason: string, meta: Record<string, unknown>) => {
  console.warn('[API/Places] CURSOR_VALIDATION_FAIL', { reason, ...meta });
};

const encodeCursor = (token: CursorToken) => {
  const secret = getCursorSecret();
  if (!secret) return null;

  const payload = Buffer.from(JSON.stringify(token), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  const signed: SignedCursorToken = { payload, signature };
  return `v4.${Buffer.from(JSON.stringify(signed), 'utf8').toString('base64url')}`;
};

const decodeCursor = (value: string): CursorToken | null => {
  if (!value.startsWith('v4.')) return null;

  const secret = getCursorSecret();
  if (!secret) return null;

  try {
    const raw = Buffer.from(value.slice(3), 'base64url').toString('utf8');
    const signed = JSON.parse(raw) as Partial<SignedCursorToken>;
    if (typeof signed.payload !== 'string' || typeof signed.signature !== 'string') {
      return null;
    }

    const expectedSignature = createHmac('sha256', secret).update(signed.payload).digest();
    const actualSignature = Buffer.from(signed.signature, 'base64url');
    if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(signed.payload, 'base64url').toString('utf8')) as Partial<CursorToken>;
    if (
      typeof parsed.docId !== 'string' ||
      typeof parsed.lastValue !== 'string' ||
      typeof parsed.queryHash !== 'string'
    ) {
      return null;
    }

    return parsed as CursorToken;
  } catch {
    return null;
  }
};

const looksLikeLocationSearch = (value: string) => {
  const tokens = value.split(' ').filter(Boolean);
  return tokens.length === 1 && value.length >= MIN_SEARCH_LENGTH && value.length <= LOCATION_HEURISTIC_MAX_LEN;
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null) {
    const ts = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
  }
  return 0;
};

const normalizeDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot): PlaceRow => {
  const data = doc.data() as Record<string, unknown>;
  const area = String(data.area || data.Area || data.region || data.city || '').trim();
  const state = String(data.state || data.State || data.province || '').trim();
  const country = String(data.country || data.Country || 'India').trim();

  return {
    id: doc.id,
    name: String(data.name || data.Name || 'Unnamed Place').trim(),
    area,
    city: String(data.city || area).trim(),
    state,
    country,
    description: String(data.description || data.Description || '').trim(),
    category: String(data.category || data.Category || 'Other').trim(),
    isActive: data.isActive !== false,
    googleMapsUrl: String(data.googleMapsUrl || '').trim(),
    coverImage: String(data.coverImage || '').trim(),
    media: Array.isArray(data.media) ? data.media : [],
    extraInfo: Array.isArray(data.extraInfo) ? data.extraInfo : [],
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
};

const buildCacheKey = async (params: {
  search: string;
  location: string;
  filter: string;
  cursor: string | null;
  limit: number;
}) => {
  const version = await getCacheVersion();
  return [
    'places',
    `v${version}_4`, // Versioned prefix
    `collection:${COLLECTION}`,
    `search:${normalize(params.search) || '_'}`,
    `location:${normalize(params.location) || '_'}`,
    `filter:${(params.filter || 'all').toLowerCase()}`,
    `cursor:${params.cursor || '_'}`,
    `limit:${params.limit}`,
  ].join(':');
};

const logApiFrequency = (cacheKey: string) => {
  const now = Date.now();
  const bucket = apiFrequency.get(cacheKey);
  const nextBucket = bucket && bucket.resetAt > now
    ? { count: bucket.count + 1, resetAt: bucket.resetAt }
    : { count: 1, resetAt: now + 60_000 };
  apiFrequency.set(cacheKey, nextBucket);

  console.info('[API/Places] API_CALL', {
    key: cacheKey,
    countInLastMinute: nextBucket.count,
  });
};

async function readCachedEnvelope(cacheKey: string): Promise<CacheEnvelope | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const cached = await redis.get<CacheEnvelope | string>(cacheKey);
    if (!cached) return null;
    return typeof cached === 'string' ? (JSON.parse(cached) as CacheEnvelope) : cached;
  } catch {
    return null;
  }
}

async function writeCachedEnvelope(cacheKey: string, payload: PlacesPayload) {
  const redis = getRedis();
  if (!redis) return;

  const now = Date.now();
  const envelope: CacheEnvelope = {
    payload,
    savedAt: now,
    staleAt: now + (payload.docsReturned === 0 ? EMPTY_CACHE_TTL_SECONDS : FRESH_TTL_SECONDS) * 1000,
  };

  const ttl = payload.docsReturned === 0 ? EMPTY_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;
  const jitter = Math.floor(Math.random() * 300); // 5 min jitter
  await redis.set(cacheKey, JSON.stringify(envelope), { ex: ttl + jitter }).catch(() => null);
}

function generateETag(payload: PlacesPayload): string {
  const results = payload.results || [];
  const ids = results.map((r) => r.id).join(',');
  const times = results.map((r) => toMillis(r.updatedAt));
  const lastUpdated = times.length > 0 ? Math.max(...times) : 0;
  return `W/"${createHash('md5').update(`${ids}-${lastUpdated}-${payload.hasMore}-${payload.totalCount}`).digest('hex')}"`;
}

async function queryFirestore(params: {
  search: string;
  location: string;
  filter: string;
  cursor: string | null;
  limit: number;
}): Promise<Omit<PlacesPayload, 'cacheStatus'>> {
  const start = Date.now();
  const fetchLimit = params.limit + 1;
  let docsRead = 0;
  let cursorToken: CursorToken | null = null;
  const currentQueryHash = getCursorQueryHash(params.search, params.location, params.filter, params.limit);

  if (params.cursor) {
    cursorToken = decodeCursor(params.cursor);
    if (!cursorToken) {
      logCursorValidationFail('decode', { cursorVersion: 'v3' });
      throw new Error('Pagination expired, please refresh');
    }

    if (cursorToken.queryHash !== currentQueryHash) {
      logCursorValidationFail('queryHash', { cursorVersion: 'v3', queryHash: currentQueryHash });
      throw new Error('Pagination expired, please refresh');
    }


  }

  const runPrefixQuery = async (field: 'name_lower' | 'location_lower' | 'location_search', value: string) => {
    let queryRef: FirebaseFirestore.Query = adminDb
      .collection(COLLECTION)
      .orderBy(field)
      .orderBy(FieldPath.documentId())
      .startAt(value)
      .endAt(`${value}\uf8ff`);

    if (cursorToken) {
      queryRef = queryRef.startAfter(cursorToken.lastValue, cursorToken.docId);
    }
    queryRef = queryRef.limit(fetchLimit);

    const snapshot = await queryRef.get();
    docsRead += snapshot.size;
    return snapshot;
  };

  const runDefaultQuery = async () => {
    let queryRef: FirebaseFirestore.Query = adminDb.collection(COLLECTION);
    queryRef = queryRef.orderBy('name_lower').orderBy(FieldPath.documentId());

    if (cursorToken) {
      queryRef = queryRef.startAfter(cursorToken.lastValue, cursorToken.docId);
    }
    queryRef = queryRef.limit(fetchLimit);

    const snapshot = await queryRef.get();
    docsRead += snapshot.size;
    return snapshot;
  };

  let queryName = 'all:bounded';
  let cursorField = 'name_lower';
  let snapshot: FirebaseFirestore.QuerySnapshot;

  // --- REDIS-BACKED SEARCH (Consistent with Admin) ---
  const redis = getRedis();
  let redisIds: string[] = [];
  if (redis && params.search && params.search.length >= MIN_SEARCH_LENGTH) {
    const normalized = params.search.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    const tokens = normalized.split(/\s+/).filter(t => t.length >= 1);
    
    // Try prefix search first
    redisIds = await redis.smembers(`idx:prefix:${normalized}`).catch(e => {
      console.error('[API/Places] Redis prefix error:', e);
      return [];
    });
    if (redisIds.length === 0) {
      // Try location_lower prefix
      redisIds = await redis.smembers(`idx:prefix:location_lower:${normalized}`).catch(e => {
        console.error('[API/Places] Redis location_lower error:', e);
        return [];
      });
    }
    
    if (redisIds.length === 0 && tokens.length > 0) {
      // Try token intersection (very powerful for multi-word or partial location searches)
      const tokenKeys = tokens.map(t => `idx:token:${t}`);
      redisIds = await (redis as any).sinter(...tokenKeys).catch((e: any) => {
        console.error('[API/Places] Redis sinter error:', e);
        return [];
      });
    }

    // CRITICAL: Redis sets are unordered. We must sort them for stable pagination.
    if (redisIds.length > 0) {
      redisIds.sort();
    }
  }

  const docSnapshots = new Map<string, any>();
  let rows: PlaceRow[] = [];

  if (redisIds.length > 0) {
    console.info('[API/Places] Redis ID Discovery', { count: redisIds.length, query: params.search });
    
    let startIndex = 0;
    if (cursorToken?.docId) {
      const idx = redisIds.indexOf(cursorToken.docId);
      console.info('[API/Places] Redis Cursor Match', { docId: cursorToken.docId, foundAt: idx });
      if (idx !== -1) startIndex = idx + 1;
    }

    const chunk = redisIds.slice(startIndex, startIndex + fetchLimit); 
    console.info('[API/Places] Redis Chunking', { startIndex, chunkSize: chunk.length, totalMatching: redisIds.length });
    
    if (chunk.length > 0) {
      const queryRef = adminDb.collection(COLLECTION).where(FieldPath.documentId(), 'in', chunk);
      const snap = await queryRef.get();
      queryName = 'redis:tokens';
      docsRead += snap.size;

      snap.docs.forEach(d => {
        docSnapshots.set(d.id, d);
      });
      
      const orderedDocs = chunk.map(id => docSnapshots.get(id)).filter(Boolean);
      console.info('[API/Places] Firestore Fetch Result', { requested: chunk.length, fetched: snap.size, ordered: orderedDocs.length });
      
      rows = orderedDocs.map(normalizeDoc).filter(p => p.isActive !== false);
      const possibleHasMore = startIndex + chunk.length < redisIds.length;
      (params as any).overrideHasMore = rows.length > params.limit || possibleHasMore;
      console.info('[API/Places] Redis Logic Result', { rows: rows.length, overrideHasMore: (params as any).overrideHasMore });
    }
  } else if (params.search && params.search.length >= MIN_SEARCH_LENGTH) {
    // --- FIRESTORE FALLBACK ---
    const preferLocation = looksLikeLocationSearch(params.search);
    let snapshot: FirebaseFirestore.QuerySnapshot;
    if (preferLocation) {
      const locationSnap = await runPrefixQuery('location_search', params.search);
      if (!locationSnap.empty) {
        snapshot = locationSnap;
        queryName = 'prefix:location_search';
        cursorField = 'location_search';
      } else {
        const areaSnap = await runPrefixQuery('location_lower', params.search);
        if (!areaSnap.empty) {
          snapshot = areaSnap;
          queryName = 'fallback:location_lower';
          cursorField = 'location_lower';
        } else {
          snapshot = await runPrefixQuery('name_lower', params.search);
          queryName = 'fallback:name_lower';
          cursorField = 'name_lower';
        }
      }
    } else {
      const nameSnap = await runPrefixQuery('name_lower', params.search);
      if (!nameSnap.empty) {
        snapshot = nameSnap;
        queryName = 'prefix:name_lower';
        cursorField = 'name_lower';
      } else {
        const locationSnap = await runPrefixQuery('location_search', params.search);
        if (!locationSnap.empty) {
          snapshot = locationSnap;
          queryName = 'fallback:location_search';
          cursorField = 'location_search';
        } else {
          snapshot = await runPrefixQuery('location_lower', params.search);
          queryName = 'fallback:location_lower';
          cursorField = 'location_lower';
        }
      }
    }
    snapshot.docs.forEach(d => docSnapshots.set(d.id, d));
    rows = snapshot.docs.map(normalizeDoc).filter((place) => place.isActive !== false);
  } else if (params.location && params.location.length >= MIN_SEARCH_LENGTH) {
    const snapshot = await runPrefixQuery('location_lower', params.location);
    queryName = 'prefix:location_lower';
    cursorField = 'location_lower';
    snapshot.docs.forEach(d => docSnapshots.set(d.id, d));
    rows = snapshot.docs.map(normalizeDoc).filter((place) => place.isActive !== false);
  } else {
    const snapshot = await runDefaultQuery();
    queryName = params.filter === 'recently-updated' ? 'recently-updated' : 'all:bounded';
    cursorField = 'name_lower';
    snapshot.docs.forEach(d => docSnapshots.set(d.id, d));
    rows = snapshot.docs.map(normalizeDoc).filter((place) => place.isActive !== false);
  }

  if (params.location && params.search) {
    rows = rows.filter((place) => {
      const locationText = normalize([place.city, place.area, place.state, place.country].filter(Boolean).join(' '));
      return locationText.includes(params.location);
    });
  }

  if (params.filter === 'photos-added') {
    rows = rows.filter((place) => Boolean(place.coverImage) || place.media.length > 0);
  } else if (params.filter === 'photos-not-added') {
    rows = rows.filter((place) => !place.coverImage && place.media.length === 0);
  } else if (params.filter === 'recently-updated') {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    rows = rows.filter((place) => toMillis(place.updatedAt) >= sevenDaysAgo);
  }

  const pageRows = rows.slice(0, params.limit);
  const hasMore = (params as any).overrideHasMore ?? (rows.length > params.limit);
  const lastPageDocId = pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null;
  const lastPageDoc = lastPageDocId ? docSnapshots.get(lastPageDocId) : null;

  console.info('[API/Places] Finalizing Response', { 
    pageRows: pageRows.length, 
    hasMore, 
    lastPageDocId, 
    foundLastDocSnap: !!lastPageDoc,
    docSnapsInMap: docSnapshots.size 
  });

  const durationMs = Date.now() - start;
  const queryLog = {
    queryName,
    collection: COLLECTION,
    queryHash: currentQueryHash,
    cursor: params.cursor,
    limit: params.limit,
    docsReturned: pageRows.length,
    docsRead,
    durationMs,
  };
  console.info('[API/Places] FIRESTORE_QUERY', queryLog);
  if (durationMs > SLOW_QUERY_MS) {
    console.warn('[API/Places] SLOW_QUERY', { route: '/api/places', ...queryLog });
  }

  return {
    rows: pageRows,
    results: pageRows,
    hasMore,
    lastDoc: hasMore && lastPageDoc
      ? encodeCursor({
        docId: pageRows[pageRows.length - 1]?.id ?? '',
        lastValue: String(lastPageDoc?.get(cursorField) ?? ''),
        queryHash: currentQueryHash,
      })
      : null,
    totalCount: pageRows.length + (hasMore ? 1 : 0),
    queryName,
    docsReturned: pageRows.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = normalize(params.get('search'));
    const location = normalize(params.get('location'));
    const filter = params.get('filter') || 'all';
    const rawCursor = params.get('cursor');
    if (rawCursor !== null && typeof rawCursor !== 'string') {
      logCursorValidationFail('non-string', { cursorType: typeof rawCursor });
      return fail('Invalid cursor.', 400);
    }

    const cursor = (rawCursor || '').trim() || null;
    if (cursor && !decodeCursor(cursor)) {
      logCursorValidationFail('decode', { cursorVersion: 'v3', cursorLength: cursor.length });
      return fail('Pagination expired, please refresh', 400, { reset: true });
    }

    if (cursor && !getCursorSecret()) {
      return fail('Cursor signing is not configured.', 500);
    }

    const limit = clampLimit(params.get('limit'));

    if ((search && search.length < MIN_SEARCH_LENGTH) || (location && location.length < MIN_SEARCH_LENGTH)) {
      return ok({
        rows: [],
        results: [],
        hasMore: false,
        lastDoc: null,
        totalCount: 0,
        cacheStatus: 'hit',
        queryName: 'short-circuit',
        docsReturned: 0,
      });
    }

    const cacheKey = await buildCacheKey({ search, location, filter, cursor, limit });
    const startTime = Date.now();

    // 1. L1 Cache Check (Ultra-hot keys)
    const l1Entry = L1_CACHE.get(cacheKey);
    if (l1Entry && Date.now() < l1Entry.expiresAt) {
      logMetrics('cache_hit_l1', { key: cacheKey, search, duration: Date.now() - startTime });
      return ok(l1Entry.payload, {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          'ETag': l1Entry.payload.etag || ''
        }
      });
    }

    logApiFrequency(cacheKey);

    const envelope = await readCachedEnvelope(cacheKey);
    const ifNoneMatch = req.headers.get('If-None-Match');

    if (envelope && envelope.payload) {
      const isStale = Date.now() > envelope.staleAt;
      const payload = envelope.payload;
      
      if (!payload.etag) payload.etag = generateETag(payload);

      if (ifNoneMatch && ifNoneMatch === payload.etag) {
        logMetrics('cache_hit_304', { key: cacheKey, search, duration: Date.now() - startTime });
        return new Response(null, { 
          status: 304,
          headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            'ETag': payload.etag
          }
        });
      }

      if (isStale) {
        const redis = getRedis();
        const swrLockKey = `lock:swr:${cacheKey}`;
        const canRefresh = redis ? await redis.set(swrLockKey, '1', { nx: true, ex: 10 }).catch(() => null) : true;

        if (canRefresh) {
          logMetrics('swr_refresh_triggered', { key: cacheKey, search });
          void (async () => {
            const refreshStart = Date.now();
            try {
              const fresh = await queryFirestore({ search, location, filter, cursor, limit });
              const freshPayload: PlacesPayload = { ...fresh, cacheStatus: 'hit' } as PlacesPayload;
              freshPayload.etag = generateETag(freshPayload);
              await writeCachedEnvelope(cacheKey, freshPayload);
              
              // Update L1 cache on refresh
              L1_CACHE.set(cacheKey, { payload: freshPayload, expiresAt: Date.now() + L1_CACHE_TTL_MS });
              
              logMetrics('swr_complete', { key: cacheKey, duration: Date.now() - refreshStart });
            } catch (e) {
              logMetrics('swr_error', { key: cacheKey, error: String(e) });
            } finally {
              if (redis) await redis.del(swrLockKey).catch(() => null);
            }
          })();
        } else {
          logMetrics('swr_lock_skipped', { key: cacheKey });
        }
        
        logMetrics('cache_hit_stale', { key: cacheKey, search, duration: Date.now() - startTime });
        return ok({ ...payload, cacheStatus: 'stale' }, {
          headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            'ETag': payload.etag
          }
        });
      }

      logMetrics('cache_hit_l2', { key: cacheKey, search, duration: Date.now() - startTime });
      return ok({ ...payload, cacheStatus: 'hit' }, {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          'ETag': payload.etag
        }
      });
    }

    console.info('[API/Places] CACHE MISS', { key: cacheKey });

    const existing = inFlight.get(cacheKey);
    if (existing) {
      try {
        const result = await existing;
        if (result) {
          const etag = result.etag || generateETag(result);
          logMetrics('cache_miss_coalesced', { key: cacheKey, search, duration: Date.now() - startTime });
          return ok({ ...result, cacheStatus: 'miss', etag }, {
            headers: {
              'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
              'ETag': etag
            }
          });
        }
      } catch (e) {
        logMetrics('error_existing_request_failed', { key: cacheKey, error: String(e) });
      }
      inFlight.delete(cacheKey);
    }

    const request = (async () => {
      try {
        const result = await queryFirestore({ search, location, filter, cursor, limit });
        const payload: PlacesPayload = { ...result, cacheStatus: 'miss' };
        payload.etag = generateETag(payload);
        await writeCachedEnvelope(cacheKey, payload);
        return payload;
      } finally {
        inFlight.delete(cacheKey);
      }
    })();

    inFlight.set(cacheKey, request);
    const finalResult = await request;

    if (!finalResult) {
      logMetrics('error_final_result_missing', { key: cacheKey });
      throw new Error('Failed to generate search results.');
    }

    // Update L1 Cache
    L1_CACHE.set(cacheKey, { payload: finalResult, expiresAt: Date.now() + L1_CACHE_TTL_MS });

    logMetrics('cache_miss_complete', { 
      key: cacheKey, 
      search, 
      duration: Date.now() - startTime,
      cacheStatus: finalResult.cacheStatus
    });

    return ok(finalResult, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'ETag': finalResult.etag || ''
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load places.';
    console.error('[API/Places] Error:', error);
    if (message === 'Pagination expired, please refresh') {
      return fail(message, 400, { reset: true });
    }
    return fail(message, 500);
  }
}
