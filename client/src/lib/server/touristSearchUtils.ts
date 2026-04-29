import { getRedis } from '@/lib/server/redis';
import * as fs from 'fs';
import * as path from 'path';

/**
 * INCREMENTAL INDEXING ENGINE + FAILOVER ARCHITECTURE
 */
const STOP = new Set(['the','in','of','and','to','for','a','an']);

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
    } catch {}
  }).catch(() => {});
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
  }).catch(() => {});
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
    } catch {}
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
    } catch {}
  }).catch(() => {});
  return writingSnapshot;
}

export async function logSystemStatus() {
   const snapshotAge = Date.now() - SNAPSHOT_UPDATED_AT;
   if (SNAPSHOT_UPDATED_AT > 0 && snapshotAge > 60 * 60 * 1000) {
      console.warn("⚠️ Snapshot is dangerously old (> 1 hour). Redis may be down extensively.");
   }
   console.log({
     redisBlocked: await isRedisBlocked(),
     queueSize: await getQueueSize(),
     snapshotAge
   });
}

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

const tokenKey = (id: string) => `place_tokens:${id}`;

// ==========================================
// 3. CORE REDIS OPERATIONS (Raw)
// ==========================================
async function upsertPlaceIndexRaw(place: any) {
  const redis = getRedis();
  if (!redis) throw new Error("Redis missing");
  const id = place.id;
  if (!id) return;
  
  const old = await redis.get(tokenKey(id));
  if (old) {
    try {
      const oldTokens = typeof old === 'string' ? JSON.parse(old) : old;
      const p = redis.pipeline();
      if (Array.isArray(oldTokens)) {
        for (const t of oldTokens) p.srem(`idx:test:token:${t}`, id);
      }
      await p.exec();
    } catch(e) {}
  }

  let tokens = expandTokens(tokenize(buildSearchable(place)));
  const p = redis.pipeline();
  const minimal = {
    id: String(id),
    name: place.name || place.Name,
    area: place.area || place.Area,
    city: place.city || place.City,
    state: place.state || place.State,
    country: place.country || place.Country,
    coverImage: place.coverImage || place.image,
    category: place.category || place.Category,
    mediaCount: Array.isArray(place.media) ? place.media.length : 0,
    updatedAt: place.updatedAt || Date.now()
  };

  p.set(`place:${id}`, JSON.stringify(minimal));
  p.set(tokenKey(id), JSON.stringify(tokens));
  p.sadd('idx:test:all_ids', id);

  for (const t of tokens) {
    p.sadd(`idx:test:token:${t}`, id);
    p.zadd('idx:test:autocomplete', { score: 0, member: t });
  }

  await p.exec();
  await redis.incr('places:version').catch(() => null);
}

async function deletePlaceIndexRaw(id: string) {
  const redis = getRedis();
  if (!redis) throw new Error("Redis missing");
  const old = await redis.get(tokenKey(id));
  const p = redis.pipeline();
  if (old) {
    try {
      const tokens = typeof old === 'string' ? JSON.parse(old) : old;
      if (Array.isArray(tokens)) {
        for (const t of tokens) p.srem(`idx:test:token:${t}`, id);
      }
    } catch(e) {}
  }
  p.srem('idx:test:all_ids', id);
  p.del(`place:${id}`);
  p.del(tokenKey(id));
  await p.exec();
  await redis.incr('places:version').catch(() => null);
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
    .map(x => x.place);

  const paginated = results.slice((page - 1) * limit, page * limit);

  return {
    data: paginated,
    total: results.length,
    page,
    hasMore: (page * limit) < results.length,
    source: 'snapshot',
    cacheStatus: 'miss',
    latencyMs: Date.now() - tStart
  };
}

export async function adminSearch({ 
  search = '', 
  location = '', 
  filter = 'all', 
  page = 1, 
  limit = 30,
  ip = ''
}: { 
  search?: string; 
  location?: string; 
  filter?: string; 
  page?: number; 
  limit?: number;
  ip?: string;
}): Promise<SearchResult> {
  const tStart = Date.now();
  const snapshotData = await getSnapshot();

  if (!search && !location && snapshotData.length > 0) {
     const filtered = snapshotData.filter(p => matchesFilter(p, filter));
     return {
         data: filtered.slice((page - 1) * limit, page * limit),
         total: filtered.length, page,
         hasMore: (page * limit) < filtered.length,
         source: 'snapshot', cacheStatus: 'hit',
         latencyMs: Date.now() - tStart
     };
  }

  try {
    return await safeRedis(async () => {
      const redis = getRedis();
      if (!redis) throw new Error("Redis missing");
      
      let ids: string[] = [];
      const tokens = Array.from(new Set([...tokenize(search), ...tokenize(location)]));
      
      if (tokens.length > 0) {
        if (tokens.length === 1) {
           const t = tokens[0];
           let matches = await redis.smembers(`idx:test:token:${t}`);
           if (matches.length === 0 && t.length >= 3) {
              const suggestions = await (redis as any).zrangebylex('idx:test:autocomplete', `[${t}`, `[${t}\xff`, { limit: { offset: 0, count: 10 } });
              if (suggestions?.length > 0) {
                 const p = redis.pipeline();
                 suggestions.forEach((s: any) => p.smembers(`idx:test:token:${s}`));
                 const rs = await p.exec();
                 const union = new Set<string>();
                 rs?.forEach((r: any) => {
                    let arr = Array.isArray(r) && r[1] !== undefined ? r[1] : r[0] || r;
                    if (Array.isArray(arr)) arr.forEach((i: string) => union.add(i));
                 });
                 matches = Array.from(union);
              }
           }
           ids = matches;
        } else {
           try {
               const keys = tokens.map(t => `idx:test:token:${t}`);
               ids = await redis.sinter(...(keys as [string, ...string[]]));
           } catch(e) {
               const best = new Set<string>();
               for (const t of tokens) {
                  const m = await redis.smembers(`idx:test:token:${t}`);
                  m.forEach((id: string) => best.add(id));
               }
               ids = Array.from(best); 
           }
        }
      } else {
        // No search/location query → fetch all IDs
        ids = await redis.smembers('idx:test:all_ids');
        // Sort IDs or handle sorting if needed. For now, just return latest.
        // Usually, we'd want to sort by updatedAt, but sets are unordered.
      }

      const pLoad = redis.pipeline();
      ids.forEach(id => pLoad.get(`place:${id}`));
      const docsRaw = await pLoad.exec() || [];
      const allData = docsRaw.map(d => {
          let val = Array.isArray(d) ? (d[1] !== undefined ? d[1] : d[0]) : d;
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return null; }
          }
          return val;
      }).filter(Boolean);

      const filtered = allData.filter(p => matchesFilter(p, filter));
      const paginated = filtered.slice((page - 1) * limit, page * limit);

      return {
         data: paginated, total: filtered.length, page,
         hasMore: (page * limit) < filtered.length,
         source: 'redis-incremental', cacheStatus: 'miss',
         latencyMs: Date.now() - tStart
      };
    });
  } catch (err) {
    console.warn("⚠️ Redis failed/blocked → using snapshot fallback");
    return await fallbackSearch(search, location, limit, page, filter);
  }
}

// ==========================================
// 6. BACKGROUND WORKERS 
// ==========================================
async function refreshSnapshot() {
  try {
    const data = await safeRedis(async () => {
      const redis = getRedis();
      if (!redis) throw new Error("Missing redis");
      const ids = await redis.smembers("idx:test:all_ids");
      if (!ids.length) return [];
      
      const pLoad = redis.pipeline();
      ids.forEach((id) => pLoad.get(`place:${id}`));
      const results = await pLoad.exec() || [];
      return results.map(d => Array.isArray(d) && d[1] ? d[1] : (Array.isArray(d) ? d[0] : d));
    });

    const parsed = data.filter(x => typeof x === 'string').map(x => JSON.parse(x as string)).filter(Boolean);
    if (parsed.length > 0) {
       await setSnapshot(parsed);
       console.log("✅ Snapshot refreshed:", parsed.length);
    }
  } catch {
    console.warn("⚠️ Snapshot refresh failed");
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

// Start Background Jobs Server-Side Safety Check
if (!(global as any).__SEARCH_WORKERS_STARTED__) {
   (global as any).__SEARCH_WORKERS_STARTED__ = true;
   setInterval(refreshSnapshot, 5 * 60 * 1000);
   
   const runReplayLoop = () => {
     replayQueue().finally(() => setTimeout(runReplayLoop, retryDelay));
   };
   runReplayLoop();

   setTimeout(refreshSnapshot, 2000);
   
   setInterval(logSystemStatus, 60000); // Log health every minute
}

export async function fullIndexPlaces(places: any[], reason: string = "manual") {
  if (!places || places.length === 0) return;
  
  console.info(`[SearchIndex] FULL REINDEX START: ${places.length} places (Reason: ${reason})`);
  const tStart = Date.now();
  
  try {
    const redis = getRedis();
    if (!redis) throw new Error("Redis missing");

    // Clear old token indices to avoid drift (optional but safer for full reindex)
    // For now, we'll just upsert everything which is safer for incremental.
    
    const BATCH = 100;
    for (let i = 0; i < places.length; i += BATCH) {
      const batch = places.slice(i, i + BATCH);
      const p = redis.pipeline();
      
      for (const place of batch) {
        const id = place.id;
        if (!id) continue;
        
        const tokens = expandTokens(tokenize(buildSearchable(place)));
        const minimal = {
          id: String(id),
          name: place.name || place.Name,
          area: place.area || place.Area,
          city: place.city || place.City,
          state: place.state || place.State,
          country: place.country || place.Country,
          coverImage: place.coverImage || place.image,
          category: place.category || place.Category,
          mediaCount: Array.isArray(place.media) ? place.media.length : 0,
          updatedAt: place.updatedAt || Date.now()
        };

        p.set(`place:${id}`, JSON.stringify(minimal));
        p.set(tokenKey(id), JSON.stringify(tokens));
        p.sadd('idx:test:all_ids', id);

        for (const t of tokens) {
          p.sadd(`idx:test:token:${t}`, id);
          p.zadd('idx:test:autocomplete', { score: 0, member: t });
        }
      }
      
      await p.exec();
      console.log(`[SearchIndex] Indexed ${Math.min(i + BATCH, places.length)}/${places.length}...`);
    }
    
    console.info(`[SearchIndex] FULL REINDEX SUCCESS: ${places.length} places in ${Date.now() - tStart}ms`);
    await setSnapshot(places); // Also update the local snapshot
  } catch (err) {
    console.error("[SearchIndex] FULL REINDEX FAILED:", err);
  }
}
export async function buildOfflineTokenIndex() { }
