import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { CacheService } from '@/modules/cache/CacheService';
import { hybridGet, hybridInvalidate, hybridSet } from '@/lib/server/hybridCache';
import { getRedis } from '@/lib/server/redis';
import { fullIndexPlaces, updatePlaceIndex, deletePlaceIndex } from './touristSearchUtils';
import fs from 'fs';
import path from 'path';

// ─── Namespace & Keys ────────────────────────────────────────────────────────
const NS = "prod:tour";
const K = {
  ALL: `${NS}:places:all`,
  VERSION: `${NS}:places:version`,
  REFRESH_LOCK: `${NS}:lock:refresh`,
  REFRESH_META: `${NS}:refresh:meta`,
  REFRESH_COUNT: `${NS}:refresh:count`,
  RETRY_LOCK: `${NS}:lock:retry`,
  LAST_SUCCESS: `${NS}:last:success`,
  LAST_ERROR: `${NS}:last:error`,
  LAST_DURATION: `${NS}:last:duration`,
};

const COLLECTION = 'touristPlaces';
const SHARED_PLACES_CACHE_TTL_SECONDS = 86_400; // 24 hours
const BACKUP_FILE_PATH = path.join(process.cwd(), 'places_backup.json');
const BACKUP_TMP_PATH = path.join(process.cwd(), 'places_backup.tmp');
const REFRESH_TRIGGER_COOLDOWN_MS = 30_000;

export class RedisUnavailableError extends Error {
  constructor(message: string = 'Redis is unavailable') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

// ─── Cold Start UX (In-Memory Snapshot & Meta) ────────────────────────────────
let inMemorySnapshot: any[] = [];
let snapshotMeta = { updatedAt: 0, version: 0 };
let isRefreshing = false;
let lastRefreshTriggerAt = 0;
let realtimeSyncBootstrapAttempted = false;

const ensureRealtimeSyncStarted = async () => {
  if (realtimeSyncBootstrapAttempted) return;
  realtimeSyncBootstrapAttempted = true;

  try {
    const { ensureFirestoreSync } = await import('@/modules/realtime/firestoreSync');
    void ensureFirestoreSync();
  } catch (error) {
    console.warn('[PlacesCache] Unable to start realtime sync', error);
  }
};

const shouldRunFullReindex = (force: boolean, reason: string) => {
  if (force) return true;
  // Rebuild indexes only for explicit repair/recovery paths.
  return reason === 'eviction_detected' || reason === 'drift_detected';
};

const triggerRefreshIfNeeded = (reason: string, force: boolean = false) => {
  const now = Date.now();
  if (!force && now - lastRefreshTriggerAt < REFRESH_TRIGGER_COOLDOWN_MS) {
    return;
  }
  lastRefreshTriggerAt = now;
  void refreshCacheInBackground(force, reason);
};

export function getInMemorySnapshot() {
  return inMemorySnapshot;
}

export function getSnapshotUpdatedAt() {
  return snapshotMeta.updatedAt;
}

export function getSnapshotVersion() {
  return snapshotMeta.version;
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  name_lower?: string;
  location_lower?: string;
};

export type SharedPlacesFilters = {
  search: string;
  location: string;
  contentFilter: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
};

const normalizeText = (value: unknown) => String(value ?? '').trim();

/**
 * ⚡ Generates a stable, globally unique ID based on place metadata
 * Used as a fallback if Firestore doc.id is missing or for deduplication.
 */
const generateStableId = (data: Record<string, any>) => {
  const name = normalizeText(data.name || data.Name || 'unnamed');
  const area = normalizeText(data.area || data.Area || 'no-area');
  const state = normalizeText(data.state || data.State || 'no-state');
  const slug = `${name}-${area}-${state}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `tp_${slug}`;
};

const normalizeDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot): SharedPlaceRecord => {
  const data = doc.data() as Record<string, unknown>;
  const area = normalizeText(data.area || data.region || data.city);
  const state = normalizeText(data.state || data.province);
  const country = normalizeText(data.country || 'India');
  const name = normalizeText(data.name || data.Name || 'Unnamed Place');
  const description = normalizeText(data.description || data.Description);
  const category = normalizeText(data.category || data.Category || 'Other');

  const id = doc.id || data.id || generateStableId(data);

  // Return only lowercase fields to avoid duplicate JSON keys (Name/name, Description/description, etc.)
  return {
    id: String(id),
    name,
    area,
    city: normalizeText(data.city || area),
    state,
    country,
    description,
    category,
    isActive: data.isActive !== false,
    googleMapsUrl: normalizeText(data.googleMapsUrl),
    coverImage: normalizeText(data.coverImage),
    media: Array.isArray(data.media) ? data.media : [],
    extraInfo: Array.isArray(data.extraInfo) ? data.extraInfo : [],
    searchName: normalizeText(data.searchName),
    searchArea: normalizeText(data.searchArea),
    searchState: normalizeText(data.searchState),
    searchCountry: normalizeText(data.searchCountry),
    name_lower: data.name_lower as string | undefined,
    location_lower: data.location_lower as string | undefined,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'number') {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const ts = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts.seconds === 'number') return (ts.seconds * 1000) + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
  }
  return 0;
};

function safeLoadBackup() {
  try {
    if (!fs.existsSync(BACKUP_FILE_PATH)) return null;
    const raw = fs.readFileSync(BACKUP_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
      return parsed;
    }
    return null;
  } catch (_e) {
    console.error("[PlacesCache] Backup corrupted, ignoring");
    return null;
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

async function loadPlacesWithRetry(retries = 3): Promise<SharedPlaceRecord[]> {
  const redis = getRedis();
  if (redis && retries < 3) {
    const retryLock = await redis.set(K.RETRY_LOCK, '1', { nx: true, ex: 10 });
    if (!retryLock) throw new Error("RETRY_STORM_PROTECTION");
  }
  try {
    const startedAt = Date.now();
    console.info('[FirestoreQuery] sharedPlacesCache load', {
      collection: COLLECTION,
      operation: 'collection.get',
      retriesRemaining: retries,
    });

    const snapshot = await adminDb.collection(COLLECTION).get();
    const places = snapshot.docs
      .map(normalizeDoc)
      .sort((a: SharedPlaceRecord, b: SharedPlaceRecord) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

    console.info('[FirestoreResult] sharedPlacesCache load', {
      docsRead: snapshot.size,
      rowsReturned: places.length,
      durationMs: Date.now() - startedAt,
      sampleIds: places.slice(0, 5).map((place) => place.id),
    });

    return places;
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(r => setTimeout(r, 2000));
    return loadPlacesWithRetry(retries - 1);
  } finally {
    if (redis) await redis.del(K.RETRY_LOCK);
  }
}

/**
 * ⚡ Ultra-Hardened Background Refresh
 */
export const refreshCacheInBackground = async (force = false, reason: string = "background_sync") => {
  const startTime = Date.now();
  const redis = getRedis();
  if (!redis) return [];

  // 1. Single Assignment Guard (Instance-local)
  if (isRefreshing) {
    console.info("[PlacesCache] Refresh already in progress (Local)");
    return [];
  }

  // 2. Mutual Exclusion Lock (Global)
  const lock = await redis.set(K.REFRESH_LOCK, '1', { nx: true, ex: 30 });
  if (!lock) {
    if (await redis.get(K.REFRESH_LOCK)) {
      return []; // Global lock active
    }
    // Fallback if set failed for other reasons
    return [];
  }

  isRefreshing = true;

  // 2. Cooldown check
  if (!force) {
    const meta = await redis.get<string>(K.REFRESH_META);
    if (meta) {
      await ensureRealtimeSyncStarted();
      try {
        const { lastRun } = JSON.parse(meta);
        if (Date.now() - lastRun < 30000) {
          await redis.del(K.REFRESH_LOCK);
          return [];
        }
      } catch (_e) {
        // Ignore JSON parse errors
      }
    }
  }

  console.info(`[PlacesCache] REFRESH START (Force: ${force})`);
  try {
    const places = await loadPlacesWithRetry();
    const duration = Date.now() - startTime;
    const version = (await redis.get(K.VERSION)) || "1";

    // Update Redis
    await hybridSet(K.ALL, places, { redisTtlSeconds: SHARED_PLACES_CACHE_TTL_SECONDS });

    // Update In-Memory Snapshot & Meta
    inMemorySnapshot = places.slice(0, 50000).map(p => ({
      id: p.id,
      name: p.name,
      area: p.area,
      city: p.city,
      coverImage: p.coverImage,
      category: p.category,
      description: p.description,
      media: p.media || [],
      extraInfo: p.extraInfo || []
    }));
    snapshotMeta.updatedAt = Date.now();

    // ⚡ Atomic Disk Write (Tmp -> Rename)
    const backupData = JSON.stringify({ version, updatedAt: Date.now(), data: places });
    await fs.promises.writeFile(BACKUP_TMP_PATH, backupData, 'utf-8');
    await fs.promises.rename(BACKUP_TMP_PATH, BACKUP_FILE_PATH);

    // Update Health & Metrics
    await redis.set(K.REFRESH_META, JSON.stringify({ lastRun: Date.now() }));
    await redis.set(K.LAST_SUCCESS, Date.now());
    await redis.set(K.LAST_DURATION, duration);
    await redis.del(K.LAST_ERROR);

    // Memory monitoring (best effort - might not be supported on all clients like Upstash)
    if (typeof (redis as any).info === 'function') {
      try {
        const info = await (redis as any).info("memory");
        if (info && typeof info === 'string') {
          const used = info.split("\n").find((l: string) => l.startsWith("used_memory_human"))?.split(":")[1]?.trim();
          console.log(`[PlacesCache] Redis memory usage: ${used || "unknown"}`);
        }
      } catch (_err) {
        // Silently skip if INFO is not permitted or fails
      }
    }

    if (shouldRunFullReindex(force, reason)) {
      void fullIndexPlaces(places, reason);
    }

    console.info('[PlacesCache] REFRESH SUCCESS', { count: places.length, duration: `${duration}ms` });
    return places;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg !== "RETRY_STORM_PROTECTION") {
      console.error('[PlacesCache] REFRESH FAILED:', msg);
      await redis.set(K.LAST_ERROR, msg);
    }
    return [];
  } finally {
    isRefreshing = false;
    await redis.del(K.REFRESH_LOCK);
  }
};

/**
 * ⚡ Ultra-Resilient Getter
 */
export const getSharedPlacesCache = async (): Promise<{
  places: SharedPlaceRecord[];
  cacheStatus: 'hit' | 'miss' | 'warming' | 'snapshot';
  source: 'hybrid' | 'fallback' | 'snapshot' | 'backup';
}> => {
  try {
    const { ensureFirestoreSync } = await import('@/modules/realtime/firestoreSync');
    void ensureFirestoreSync();
  } catch (error) {
    console.warn('[PlacesCache] Unable to start realtime sync during cache read', error);
  }

  const redis = getRedis();

  try {
    // 1. Proactive Eviction Check
    if (redis && !(await redis.exists(K.ALL))) {
      console.warn('[PlacesCache] Cache evicted → Rebuilding');
      triggerRefreshIfNeeded('eviction_detected');
    }

    const places = await hybridGet<SharedPlaceRecord[]>(
      K.ALL,
      async () => {
        // Fallback to in-memory snapshot if Redis K.ALL is empty or expired
        if (inMemorySnapshot.length > 0) {
          return inMemorySnapshot as SharedPlaceRecord[];
        }
        return [];
      },
      { redisTtlSeconds: SHARED_PLACES_CACHE_TTL_SECONDS }
    );

    // 3. If caches are empty, trigger a background refresh instead of forcing
    //    a synchronous full Firestore load. Synchronous loads on cold serverless
    //    instances can cause repeated full-collection reads and large Firestore
    //    bills. We will trigger `refreshCacheInBackground()` (protected by a
    //    global Redis lock) and return an empty snapshot; callers should handle
    //    the empty result (the snapshot will warm in the background).
    if (!places || places.length === 0) {
      console.info('[PlacesCache] All caches empty → scheduling background refresh (no sync load)');
      try {
        // Avoid awaiting to prevent blocking the request path. The background
        // refresh will populate Redis and in-memory snapshot when complete.
        triggerRefreshIfNeeded('cold_start', false);
      } catch (err) {
        console.warn('[PlacesCache] Failed to schedule background refresh', err);
      }
      // If we have an in-memory snapshot return that, otherwise return an empty array
      if (inMemorySnapshot.length > 0) {
        return { places: inMemorySnapshot as SharedPlaceRecord[], cacheStatus: 'snapshot', source: 'snapshot' };
      }
      return { places: [], cacheStatus: 'warming', source: 'hybrid' };
    }

    // 4. Snapshot Fallback (already populated from memory)
    if ((!places || places.length === 0) && inMemorySnapshot.length > 0) {
      return { places: inMemorySnapshot as SharedPlaceRecord[], cacheStatus: 'snapshot', source: 'snapshot' };
    }

    // 5. Safe Disk Backup Load (Corruption Guard)
    const backup = safeLoadBackup();
    if ((!places || places.length === 0) && backup) {
      // Disk backup check
      console.info('[PlacesCache] Recovered via Atomic Disk Backup');

      // Warm Memory Snapshot
      inMemorySnapshot = backup.data.slice(0, 50000).map((p: any) => ({
        id: p.id,
        name: p.name,
        area: p.area,
        city: p.city,
        coverImage: p.coverImage,
        description: p.description,
        media: p.media || [],
        extraInfo: p.extraInfo || []
      }));
      snapshotMeta.updatedAt = backup.updatedAt;

      // Warm Redis
      if (redis) void redis.set(K.ALL, JSON.stringify({
        value: backup.data, version: "v2", createdAt: Date.now(), expiresAt: Date.now() + 86400000, ttlSeconds: 86400
      }));

      return { places: backup.data, cacheStatus: 'snapshot', source: 'backup' };
    }

    return {
      places: places || [],
      cacheStatus: (places?.length > 0) ? 'hit' : 'warming',
      source: 'hybrid'
    };
  } catch (_error) {
    return { places: inMemorySnapshot as SharedPlaceRecord[], cacheStatus: 'snapshot', source: 'snapshot' };
  }
};

/**
 * ⚡ Background Heartbeat (Protected)
 */
if (typeof window === 'undefined' && process.env.ENABLE_PLACES_CACHE_HEARTBEAT === 'true') {
  setInterval(async () => {
    const redis = getRedis();
    if (redis && (await redis.get(K.REFRESH_LOCK))) return;
    void refreshCacheInBackground();
  }, 300000);
}

export const refreshSharedPlacesCache = async () => {
  try {
    const { ensureFirestoreSync } = await import('@/modules/realtime/firestoreSync');
    void ensureFirestoreSync();
  } catch (error) {
    console.warn('[PlacesCache] Unable to start realtime sync during refresh', error);
  }

  await hybridInvalidate(K.ALL);
  const places = await refreshCacheInBackground(true);
  return {
    places,
    cacheStatus: places.length > 0 ? 'miss' as const : 'warming' as const,
    source: 'firestore' as const,
  };
};

export const updateSharedPlaceInCache = async (data: any, type: 'create' | 'update' | 'delete' = 'update') => {
  try {
    const redis = getRedis();
    if (redis) await redis.del(K.REFRESH_META);
    await hybridInvalidate(K.ALL);
    await CacheService.invalidatePattern('search:');
    await CacheService.invalidatePattern('places:search:');
    await CacheService.invalidate('prod:tour:places:all');

    // Update in-memory snapshot so instances without Redis see the change immediately
    try {
      const id = String(data.id || data.ID || '').trim();
      if (id) {
        if (type === 'delete') {
          inMemorySnapshot = inMemorySnapshot.filter((p: any) => String(p.id) !== id);
        } else {
          const existingIdx = inMemorySnapshot.findIndex((p: any) => String(p.id) === id);
          const item = {
            id,
            name: String(data.name || data.Name || '').trim(),
            area: String(data.area || data.Area || '').trim(),
            city: String(data.city || data.City || data.area || data.Area || '').trim(),
            coverImage: String(data.coverImage || data.cover_img || data.cover || '').trim(),
            category: String(data.category || data.Category || '').trim(),
            description: String(data.description || data.Description || '').trim(),
            media: Array.isArray(data.media) ? data.media : [],
            extraInfo: Array.isArray(data.extraInfo) ? data.extraInfo : [],
          };
          if (existingIdx === -1) {
            // add to front for recency
            inMemorySnapshot.unshift(item);
            // cap snapshot size
            if (inMemorySnapshot.length > 50000) inMemorySnapshot.length = 50000;
          } else {
            inMemorySnapshot[existingIdx] = { ...inMemorySnapshot[existingIdx], ...item };
          }
        }
        snapshotMeta.updatedAt = Date.now();
      }
    } catch (e) {
      console.warn('[PlacesCache] failed to update inMemorySnapshot', e);
    }

    if (type === 'delete') await deletePlaceIndex(data.id);
    else await updatePlaceIndex(data);
  } catch (error) {
    console.error(`[PlacesCache] Admin update failed:`, error);
  }
};

export const normalizeSharedPlacesFilters = (filters: Partial<SharedPlacesFilters>): SharedPlacesFilters => {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    search: norm(String(filters.search ?? '')),
    location: norm(String(filters.location ?? '')),
    contentFilter: filters.contentFilter || 'all'
  };
};

export const paginateSharedPlaces = <T>(places: T[], page: number, limit: number) => {
  const p = Math.max(1, page);
  const l = Math.max(1, limit);
  const start = (p - 1) * l;
  const end = start + l;
  return {
    rows: places.slice(start, end),
    hasMore: end < places.length,
    nextPage: end < places.length ? p + 1 : null,
    total: places.length,
  };
};

export const matchesSharedPlaceFilters = (place: SharedPlaceRecord, filters: SharedPlacesFilters): boolean => {
  const hasPhotos = Boolean(place.coverImage) || (Array.isArray(place.media) && place.media.length > 0);
  if (filters.contentFilter === 'photos-added') {
    return hasPhotos;
  }
  if (filters.contentFilter === 'photos-not-added') {
    return !hasPhotos;
  }
  if (filters.contentFilter === 'recently-updated') {
    const lastUpdate = toMillis(place.updatedAt);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return lastUpdate > sevenDaysAgo;
  }
  return true;
};

export const filterSharedPlaces = (places: SharedPlaceRecord[], filters: SharedPlacesFilters): SharedPlaceRecord[] => {
  return places.filter(p => matchesSharedPlaceFilters(p, filters));
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
if (typeof process !== 'undefined') {
  process.on("SIGTERM", async () => {
    console.log("[PlacesCache] Received SIGTERM, shutting down safely...");
    // Future: Close redis connection if using a persistent client
  });
}
