import { getRedis } from '@/lib/server/redis';
import { SearchService } from '@/modules/search/SearchService';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

async function compress(data: any): Promise<string> {
  const buf = Buffer.from(JSON.stringify(data));
  const compressed = await gzip(buf);
  return compressed.toString('base64');
}

async function decompress(base64: string): Promise<any> {
  const buf = Buffer.from(base64, 'base64');
  const decompressed = await gunzip(buf);
  return JSON.parse(decompressed.toString());
}
/**
 * INCREMENTAL INDEXING ENGINE + FAILOVER ARCHITECTURE
 */
const STOP = new Set(['the', 'in', 'of', 'and', 'to', 'for', 'a', 'an']);

export type SearchResult = {
  data: any[];
  total: number;
  page: number;
  hasMore: boolean;
  source: 'redis-incremental' | 'redis' | 'snapshot' | 'short-circuit';
  cacheStatus: 'hit' | 'miss' | 'error';
  latencyMs: number;
};

// ==========================================
// 1. GLOBAL STATE & FAILOVER QUEUES
// ==========================================
const QUEUE_FILE = path.join(process.cwd(), '.search_queue.json');
const SNAPSHOT_FILE = path.join(process.cwd(), '.search_snapshot.json');

let REDIS_BLOCKED_UNTIL = 0;
let SNAPSHOT: any[] = [];
let SNAPSHOT_UPDATED_AT = 0;
let IS_READY = false;

const SHARD_SIZE = 500;
const EXPECTED_MIN_RECORDS = 1500;
let rebuildTimeout: NodeJS.Timeout | null = null;

// Disk-backed Queue System
async function loadQueue(): Promise<any[]> {
  try { return JSON.parse(await fs.promises.readFile(QUEUE_FILE, 'utf-8')); } catch { return []; }
}
let writingQueue = Promise.resolve();

async function saveQueue(q: any[]) {
  writingQueue = writingQueue.then(async () => {
    try {
      if (q.length > 5000) q = q.slice(-5000); // 5000 item queue limit
      const tmpFile = `${QUEUE_FILE}.tmp`;
      await fs.promises.writeFile(tmpFile, JSON.stringify(q));
      await fs.promises.rename(tmpFile, QUEUE_FILE);
    } catch {
      // Ignore write failures to the disk-backed queue
    }
  }).catch(() => { });
  return writingQueue;
}

let queueReadWriteMutex = Promise.resolve();

async function pushQueue(job: any) {
  queueReadWriteMutex = queueReadWriteMutex.then(async () => {
    const q = await loadQueue();
    const idValue = job.type === "upsert" ? job.place.id : job.id;
    const deduplicated = q.filter((j: any) => (j.type === "upsert" ? j.place.id : j.id) !== idValue);
    deduplicated.push(job);
    await saveQueue(deduplicated);
  }).catch(() => { });
  return queueReadWriteMutex;
}
async function getQueueSize() {
  return (await loadQueue()).length;
}

export async function isRedisBlocked() {
  if (Date.now() < REDIS_BLOCKED_UNTIL) return true;

  if (REDIS_BLOCKED_UNTIL > 0) {
    // Block time expired. Send a test ping to see if recovered
    try {
      const redis = getRedis();
      if (!redis) throw new Error();
      await redis.ping();
      REDIS_BLOCKED_UNTIL = 0;
      console.log("✅ Redis recovered successfully.");
      return false;
    } catch {
      // Still failing, block for another minute
      REDIS_BLOCKED_UNTIL = Date.now() + 60 * 1000;
      return true;
    }
  }
  return false;
}

export async function safeRedis<T>(fn: () => Promise<T>): Promise<T> {
  if (await isRedisBlocked()) throw new Error("REDIS_BLOCKED");

  try {
    return await fn();
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("max requests limit") || msg.includes("rate limit") || msg.includes("Timeout")) {
      REDIS_BLOCKED_UNTIL = Date.now() + 5 * 60 * 1000;
      console.error("🚨 Redis quota hit. Blocking for 5 mins");
    }
    throw e;
  }
}

// Disk-backed Snapshot System
export async function getSnapshot() {
  if (SNAPSHOT.length === 0) {
    try {
      SNAPSHOT = JSON.parse(await fs.promises.readFile(SNAPSHOT_FILE, 'utf-8'));
      const stat = await fs.promises.stat(SNAPSHOT_FILE);
      SNAPSHOT_UPDATED_AT = stat.mtimeMs;
      console.log(`✅ Loaded ${SNAPSHOT.length} items from disk snapshot.`);
    } catch {
      // Ignore read failures, will try to reload from redis later
    }
  }
  return SNAPSHOT;
}

let writingSnapshot = Promise.resolve();

export async function setSnapshot(data: any[]) {
  SNAPSHOT = data;
  SNAPSHOT_UPDATED_AT = Date.now();
  writingSnapshot = writingSnapshot.then(async () => {
    try {
      const tmpFile = `${SNAPSHOT_FILE}.tmp`;
      await fs.promises.writeFile(tmpFile, JSON.stringify(data));
      await fs.promises.rename(tmpFile, SNAPSHOT_FILE);
    } catch {
      // Ignore write failures, will try to sync next time
    }
  }).catch(() => { });
  return writingSnapshot;
}

// Snapshot logic decommissioned in favor of SearchService

// ==========================================
// 2. TEXT PROCESSING UTILS
// ==========================================
export function normalize(str: string = '') {
  return String(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
  // Allow 2-character tokens (like "UP", "Go") and preserve everything else
  return normalize(text).split(' ').filter(t => t.length >= 2 && !STOP.has(t));
}

export function buildSearchable(p: any): string {
  return [
    p.name || p.Name,
    p.city || p.City,
    p.area || p.Area,
    p.state || p.State,
    p.country || p.Country,
    p.category || p.Category
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const geoMap: Record<string, string> = {
  kalighat: 'kolkata', parkstreet: 'kolkata', newtown: 'kolkata', saltlake: 'kolkata', dumdum: 'kolkata',
  calangute: 'goa', baga: 'goa', anjuna: 'goa', northgoa: 'goa', southgoa: 'goa'
};

export function expandTokens(tokens: string[]) {
  const out: string[] = [];
  for (const t of tokens) {
    out.push(t);
    if (geoMap[t]) out.push(geoMap[t]);
  }
  return Array.from(new Set(out)).slice(0, 15);
}

function buildMinimal(p: any) {
  const id = p.id || p.Id || p._id || (p.name && p.area ? `tp_${normalize(p.name + p.area)}` : null);

  if (!id) {
    console.warn("[SearchUtils] Skipping minimal build: No ID found", p.name);
    return null;
  }

  return {
    id: String(id),
    name: p.name || p.Name || 'Unnamed',
    city: p.city || p.City || p.area || p.Area || 'Unknown',
    state: p.state || p.State || 'Unknown',
    country: p.country || p.Country || 'India',
    category: p.category || p.Category || 'Other',
    coverImage: p.coverImage || p.image || '',
    mediaCount: Array.isArray(p.media) ? p.media.length : (p.mediaCount || 0),
    media: p.media || [],
    extraInfo: p.extraInfo || [],
    description: p.description || p.Description || '',
    updatedAt: p.updatedAt || Date.now()
  };
}

// ==========================================
// 3. CORE REDIS OPERATIONS (Hardened)
// ==========================================

/**
 * ⚡ Atomic & Sharded Index Persistence
 */
async function saveIndexToRedis() {
  const redis = getRedis();
  if (!redis) return;

  const tStart = Date.now();
  try {
    // 1. Create Shards (Sent individually to stay under 1MB REST limit per request)
    const shardCount = Math.ceil(SNAPSHOT.length / SHARD_SIZE);

    for (let i = 0; i < shardCount; i++) {
      const shardData = SNAPSHOT.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
      const compressed = await compress(shardData);
      // Small individual sets are safer than one giant multi() on Upstash REST
      await redis.set(`places:min:shard:${i}`, compressed);
    }

    // 2. Update Meta Data & Version Atomically (Small enough for multi)
    const newVersion = String(Date.now());
    const multi = redis.multi();
    multi.set('places:min:shards', String(shardCount));
    multi.set('places:version', newVersion);
    await multi.exec();

    (global as any).__LAST_SNAPSHOT_VERSION__ = newVersion;
    console.info(`[SearchHardening] Index persisted. Shards: ${shardCount}, Latency: ${Date.now() - tStart}ms`);
  } catch (err) {
    console.error("[SearchHardening] Failed to persist index:", err);
  }
}

/**
 * ⚡ Debounced Index Rebuild
 */
function scheduleIndexRebuild() {
  if (rebuildTimeout) return;

  console.log("⏱️ Index rebuild scheduled (5s debounce)...");
  rebuildTimeout = setTimeout(async () => {
    await saveIndexToRedis();
    rebuildTimeout = null;
  }, 5000);
}

async function upsertPlaceIndexRaw(place: any) {
  const redis = getRedis();
  if (!redis) throw new Error("Redis missing");
  const id = place.id;
  if (!id) {
    console.error("[SearchUtils] CRITICAL: Cannot upsert place without ID", place);
    return;
  }

  const minimal = buildMinimal(place);
  if (!minimal) return;
  const index = SNAPSHOT.findIndex(p => p.id === id);
  if (index >= 0) SNAPSHOT[index] = minimal;
  else SNAPSHOT.push(minimal);

  // 3. Schedule Background Rebuild
  scheduleIndexRebuild();
}

async function deletePlaceIndexRaw(id: string) {
  const redis = getRedis();
  if (!redis) throw new Error("Redis missing");

  // 1. Remove Full Object
  await redis.del(`places:full:${id}`);

  // 2. Update Local Memory Snapshot
  SNAPSHOT = SNAPSHOT.filter(p => p.id !== id);

  // 3. Schedule Background Rebuild
  scheduleIndexRebuild();
}

// ==========================================
// 4. QUEUE WRAPPERS (Safe Mode)
// ==========================================
export async function safeUpsert(place: any) {
  try {
    await safeRedis(() => upsertPlaceIndexRaw(place));
  } catch {
    console.log("📦 Queueing update to disk");
    await pushQueue({ type: "upsert", place });
  }
}

export async function safeDelete(id: string) {
  try {
    await safeRedis(() => deletePlaceIndexRaw(id));
  } catch {
    console.log("📦 Queueing delete to disk");
    await pushQueue({ type: "delete", id });
  }
}

// Maintain backward compatibility aliases
export const upsertPlaceIndex = safeUpsert;
export const deletePlaceIndex = safeDelete;
export const updatePlaceIndex = safeUpsert;

// ==========================================
// 5. SEARCH & FALLBACK
// ==========================================
function toMillis(value: any) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null) {
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return (value.seconds * 1000);
  }
  return Number(value || 0);
}

function matchesFilter(place: any, filter: string) {
  if (filter === 'all') return true;

  const hasPhotos = Boolean(place.coverImage) || (Number(place.mediaCount || 0) > 0);

  if (filter === 'photos-added') return hasPhotos;
  if (filter === 'photos-not-added') return !hasPhotos;

  if (filter === 'recently-updated') {
    const lastUpdate = toMillis(place.updatedAt);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return lastUpdate > sevenDaysAgo;
  }

  return true;
}

async function fallbackSearch(query: string, location: string, limit: number, page: number, filter: string = 'all'): Promise<SearchResult> {
  const tStart = Date.now();
  const qStr = `${query} ${location}`.trim();
  const q = normalize(qStr);

  const snapshotData = await getSnapshot();

  // Guardrail: Trigger fallback if dataset is suspiciously small
  if (snapshotData.length < EXPECTED_MIN_RECORDS) {
    console.warn(`[SearchGuard] Dataset truncated (${snapshotData.length} < ${EXPECTED_MIN_RECORDS}). Using Firestore fallback.`);
    throw new Error("SEARCH_INDEX_TRUNCATED");
  }

  const results = snapshotData
    .map(place => {
      let score = 0;
      const text = buildSearchable(place).toLowerCase();
      const placeName = (place.name || place.Name || '').toLowerCase();

      if (q) {
        if (placeName === q) score += 100;
        else if (placeName.startsWith(q)) score += 80;
        else if (text.includes(q)) score += 50;

        if (place.city?.toLowerCase().includes(q)) score += 40;
        if (place.state?.toLowerCase().includes(q)) score += 30;
      } else {
        score = 1; // Basic score if no search query but filter might be present
      }

      return { place, score };
    })
    .filter(x => x.score > 0 && matchesFilter(x.place, filter))
    .sort((a, b) => b.score - a.score)
    .map(x => x.place)
    .filter(p => p && p.id && p.id !== "undefined");

  const paginated = results.slice((page - 1) * limit, page * limit);

  const latency = performance.now() - tStart;
  return {
    data: paginated,
    total: results.length,
    page,
    hasMore: (page * limit) < results.length,
    source: 'snapshot',
    cacheStatus: 'miss',
    latencyMs: latency
  };
}

export async function adminSearch({
  search = '',
  location = '',
  filter = 'all',
  page = 1,
  limit = 30,
}: {
  search?: string;
  location?: string;
  filter?: string;
  page?: number;
  limit?: number;
}): Promise<SearchResult> {
  const tStart = Date.now();

  const result = await SearchService.searchPlaces({
    query: search,
    location,
    category: 'all',
    contentFilter: filter as 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated',
    page,
    limit,
    isActive: undefined,
  });

  const latency = Date.now() - tStart;

  return {
    data: result.results,
    total: result.totalCount, // Note: total count is -1 in basic search, can be fetched if needed
    page,
    hasMore: result.hasMore,
    source: result.source,
    cacheStatus: result.fromCache ? 'hit' : 'miss',
    latencyMs: latency
  };
}

export async function getPlaceFull(id: string) {
  try {
    return await safeRedis(async () => {
      const redis = getRedis();
      if (!redis) throw new Error("Redis missing");
      const data = await redis.get(`places:full:${id}`);
      return data ? JSON.parse(data as string) : null;
    });
  } catch {
    return null;
  }
}

// ==========================================
// 6. BACKGROUND WORKERS 
// ==========================================
async function refreshSnapshot(force = false) {
  try {
    const redis = getRedis();
    if (!redis) return;

    // 1. Check Version & Shard Meta
    const [currentVersion, shardCountStr] = await Promise.all([
      redis.get<string>('places:version'),
      redis.get<string>('places:min:shards')
    ]);

    const lastVersion = (global as any).__LAST_SNAPSHOT_VERSION__ || '0';
    if (!force && currentVersion === lastVersion && SNAPSHOT.length > 0) {
      IS_READY = true;
      return;
    }

    const shardCount = parseInt(shardCountStr || '0', 10);
    if (shardCount === 0) {
      console.warn("[SearchSync] No shards found in Redis.");
      return;
    }

    console.log(`[SearchSync] Syncing ${shardCount} shards (Version: ${currentVersion})...`);

    // 2. Fetch All Shards in Parallel (MGET)
    const shardKeys = Array.from({ length: shardCount }, (_, i) => `places:min:shard:${i}`);
    const compressedShards = await redis.mget(...shardKeys);

    // 3. Strict Shard Validation: If any shard is missing, the entire index is corrupted
    if (compressedShards.some(s => s === null)) {
      console.error(`[SearchSync] Integrity failure: Missing shards in version ${currentVersion}`);
      return;
    }

    // 4. Decompress & Merge
    let mergedData: any[] = [];
    for (const compressed of compressedShards) {
      const data = await decompress(compressed as string);
      mergedData = mergedData.concat(data);
    }

    // 5. Final Dataset Validation
    if (mergedData.length < EXPECTED_MIN_RECORDS) {
      console.error(`[SearchSync] Dataset too small (${mergedData.length}). Rejecting index.`);
      return;
    }

    await setSnapshot(mergedData);
    (global as any).__LAST_SNAPSHOT_VERSION__ = currentVersion;
    IS_READY = true;
    console.info(`[SearchSync] Successfully synced ${mergedData.length} places in ${shardCount} shards.`);
  } catch (err) {
    console.warn("[SearchSync] Background sync failed:", err);
  }
}

let retryDelay = 10000;

async function replayQueue() {
  if (await isRedisBlocked() || (await getQueueSize()) === 0) return;

  const currentQueue = await loadQueue();
  console.log("🔁 Replaying queue from disk:", currentQueue.length);

  let successCount = 0;
  let failed = false;

  while (currentQueue.length > 0) {
    const job = currentQueue[0];
    try {
      if (job.type === "upsert") await upsertPlaceIndexRaw(job.place);
      else await deletePlaceIndexRaw(job.id);

      currentQueue.shift();
      await saveQueue(currentQueue);
      successCount++;
    } catch {
      console.log("⚠️ Replay failed → backing off");
      failed = true;
      break;
    }
  }

  if (failed) {
    retryDelay = Math.min(retryDelay * 2, 300000); // max 5 min backoff
  } else if (successCount > 0) {
    retryDelay = 10000; // reset
  }
}

// Legacy Background Workers Disabled
// We have migrated to SearchService which uses direct Firestore prefix search.
// Background snapshotting is no longer required.
if (!(global as any).__SEARCH_WORKERS_STARTED__) {
  (global as any).__SEARCH_WORKERS_STARTED__ = true;
  console.log("🚀 Legacy Search Workers disabled. Using New Production Architecture.");
}

export async function fullIndexPlaces(places: any[], reason: string = "manual") {
  if (!places || places.length === 0) return;

  console.info(`[SearchIndex] FULL REINDEX START: ${places.length} places (Reason: ${reason})`);
  const tStart = Date.now();

  try {
    const redis = getRedis();
    if (!redis) throw new Error("Redis missing");

    const minBatch = places.map(buildMinimal).filter((p): p is any => p !== null && !!(p.id && p.id !== "undefined"));

    const BATCH = 100;
    for (let i = 0; i < places.length; i += BATCH) {
      const batch = places.slice(i, i + BATCH);
      const p = redis.pipeline();

      for (const place of batch) {
        const id = place.id;
        if (!id) continue;
        p.set(`places:full:${id}`, JSON.stringify(place));
      }

      await p.exec();
      console.log(`[SearchIndex] Indexed Full Objects ${Math.min(i + BATCH, places.length)}/${places.length}...`);
    }

    // Update Sharded Index (Individually to stay under REST limits)
    const shardCount = Math.ceil(minBatch.length / SHARD_SIZE);
    for (let i = 0; i < shardCount; i++) {
      const shardData = minBatch.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
      const compressed = await compress(shardData);
      await redis.set(`places:min:shard:${i}`, compressed);
    }

    // Atomic Update of Meta Data
    const newVersion = String(Date.now());
    const multi = redis.multi();
    multi.set('places:min:shards', String(shardCount));
    multi.set('places:version', newVersion);
    await multi.exec();

    await setSnapshot(minBatch);
    (global as any).__LAST_SNAPSHOT_VERSION__ = newVersion;
    IS_READY = true;

    console.info(`[SearchIndex] FULL REINDEX SUCCESS: ${places.length} places (${shardCount} shards) in ${Date.now() - tStart}ms`);
  } catch (err) {
    console.error("[SearchIndex] FULL REINDEX FAILED:", err);
  }
}
export async function buildOfflineTokenIndex() { }
