import { getRedis } from '@/lib/server/redis';
import crypto from 'crypto';

/**
 * ─── CONFIGURATION & TYPES ───────────────────────────────────────────────────
 */
const CACHE_TTL = 600; // 10 minutes for reusable admin searches
const EMPTY_CACHE_TTL = 300; // 5 minutes for negative caching
const SNAPSHOT_FRESHNESS_LIMIT = 3600_000; // 1 hour
const SEARCH_LIMIT = 500; // Increased from 200 for better admin visibility
const REINDEX_CHUNK = 200; // Pipeline chunk size
const MAX_DATASET_SIZE = 200_000; // Defensive cap

export type SearchResult = {
  data: any[];
  total: number;
  page: number;
  hasMore: boolean;
  source: 'redis' | 'snapshot' | 'short-circuit';
  cacheStatus: 'hit' | 'miss' | 'error';
  latencyMs: number;
};

/**
 * ─── INDEXING ENGINE (Double-Buffer) ────────────────────────────────────────
 */

/**
 * Full Re-indexing logic with owner-safe locking, backoff, and atomic swap.
 */
export async function fullIndexPlaces(reason: string = "manual") {
  const tStart = Date.now();
  const redis = getRedis();
  if (!redis) return;

  // 1. REBUILD COOLDOWN + BACKOFF
  const redisTime = await redis.time().catch(() => [Math.floor(Date.now() / 1000), 0]);
  const nowMs = redisTime[0] * 1000;

  const lastRebuild = await redis.get<string>("rebuild:last_ts").catch(() => null);
  const failCount = await redis.get<number>("rebuild:fail_count").catch(() => 0) || 0;
  const backoffDelay = Math.min(60000, failCount * 10000);

  if (lastRebuild && nowMs - Number(lastRebuild) < (30000 + backoffDelay)) {
    console.info(`[SearchEngine] Rebuild backoff active (${30 + backoffDelay / 1000}s), skipping.`);
    return;
  }

  // 2. GLOBAL LOCK (Owner-safe UUID)
  const lockOwner = crypto.randomUUID();
  const locked = await redis.set("lock:full_reindex", lockOwner, { nx: true, ex: 60 });
  if (!locked) {
    console.info("[SearchEngine] Rebuild already in progress globally.");
    return;
  }

  // Set cooldown start
  const jitter = Math.floor(Math.random() * 5000);
  await redis.set("rebuild:last_ts", String(nowMs), { px: 30000 + jitter }).catch(() => null);
  await redis.set("rebuild:last_reason", reason, { ex: 3600 }).catch(() => null);

  console.info(`[SearchEngine] STARTING FULL INDEX (Reason: ${reason})...`);
  const TMP = "tmp:";
  const r = redis!;

  try {
    const { getSharedPlacesCache } = await import('./sharedPlacesCache');
    const dataset = await getSharedPlacesCache();
    const places = dataset.places;

    if (!places || places.length === 0) {
      console.warn("[SearchEngine] Aborting: No places found in source.");
      return;
    }

    if (places.length > MAX_DATASET_SIZE) {
      console.error(`[SearchEngine] Aborting: Dataset too large (${places.length})`);
      return;
    }

    // PHASE 1: Double-Buffer Build
    const tmpTokens = new Set<string>();
    const tmpPrefixes = new Set<string>();
    await r.expire(`${TMP}_registry`, 600).catch(() => null);

    for (let i = 0; i < places.length; i += REINDEX_CHUNK) {
      const chunk = places.slice(i, i + REINDEX_CHUNK);
      const pipeline = r.pipeline();
      for (const place of chunk) {
        const id = place.id;
        pipeline.set(`place:${id}`, place, { ex: 86400 });
        pipeline.sadd(`${TMP}idx:all_ids`, id);
        pipeline.sadd(`${TMP}_registry`, `${TMP}idx:all_ids`);

        const tokens = [...new Set(tokenize(buildSearchable(place)))];
        for (const token of tokens) {
          tmpTokens.add(token);
          const tKey = `${TMP}idx:token:${token}`;
          pipeline.sadd(tKey, id);
          pipeline.sadd(`${TMP}idx:all_tokens`, token);
          pipeline.sadd(`${TMP}_registry`, tKey);
          for (let l = 1; l <= Math.min(token.length, 5); l++) {
            const pref = token.slice(0, l);
            tmpPrefixes.add(pref);
            const pKey = `${TMP}idx:prefix:${pref}`;
            pipeline.sadd(pKey, id);
            pipeline.sadd(`${TMP}_registry`, pKey);
          }
        }

        // Special Prioritization Indices (Production Logic)
        const nameLower = place.name_lower || normalize(place.name || place.Name);
        const locLower = place.location_lower || normalize([
          place.area || place.Area,
          place.city || place.City,
          place.state || place.State,
          place.country || place.Country,
        ].filter(Boolean).join(' '));

        if (nameLower) {
          for (let l = 1; l <= Math.min(nameLower.length, 12); l++) {
            const pref = nameLower.slice(0, l);
            const pKey = `${TMP}idx:prefix:name_lower:${pref}`;
            pipeline.sadd(pKey, id);
            pipeline.sadd(`${TMP}_registry`, pKey);
          }
        }

        if (locLower) {
          for (let l = 1; l <= Math.min(locLower.length, 12); l++) {
            const pref = locLower.slice(0, l);
            const pKey = `${TMP}idx:prefix:location_lower:${pref}`;
            pipeline.sadd(pKey, id);
            pipeline.sadd(`${TMP}_registry`, pKey);
          }
        }
      }
      pipeline.sadd(`${TMP}_registry`, `${TMP}idx:all_tokens`);
      await pipeline.exec();
    }

    // PHASE 2: Dataset Sanity Check
    const tmpCount = await r.scard(`${TMP}idx:all_ids`).catch(() => 0);
    const lastSize = await r.get<number>("idx:last_size").catch(() => 0) || 0;
    const minRequired = Math.max(10, Math.floor(lastSize * 0.1));

    if (tmpCount < minRequired) {
      console.error(`[SearchEngine] SUSPICIOUS DATA: ${tmpCount} records (last: ${lastSize}). Aborting.`);
      await r.incr("rebuild:fail_count").catch(() => null);
      await r.expire("rebuild:fail_count", 600).catch(() => null);
      return;
    }

    // PHASE 3: Atomic Swap
    const oldTokens = await r.smembers("idx:all_tokens");
    for (let i = 0; i < oldTokens.length; i += REINDEX_CHUNK) {
      const chunk = oldTokens.slice(i, i + REINDEX_CHUNK);
      const delPipeline = r.pipeline();
      chunk.forEach(t => delPipeline.unlink(`idx:token:${t}`));
      await delPipeline.exec();
    }
    await r.unlink("idx:all_tokens", "idx:all_ids", "idx:seen_queries").catch(() => r.del("idx:all_tokens", "idx:all_ids", "idx:seen_queries"));

    // Safe RENAMENX loop
    async function safeSwap(from: string, to: string) {
      try {
        const exists = await r.exists(from).catch(() => 0);
        if (!exists) return;
        
        const ok = await (r as any).renamenx(from, to).catch(() => 0);
        if (!ok) {
          // Destination already exists, force swap
          await r.unlink(to).catch(() => r.del(to)).catch(() => null);
          await r.rename(from, to).catch((err: any) => {
            if (err?.message?.includes("no such key")) return;
            throw err;
          });
        }
      } catch (err) {
        console.warn(`[SearchEngine] Swap warning for ${from}:`, err);
      }
    }

    // Parallelize individual key swaps in chunks for performance
    const tokenSwapList = [...tmpTokens].map(t => ({ from: `${TMP}idx:token:${t}`, to: `idx:token:${t}` }));
    const prefixSwapList = [...tmpPrefixes].map(p => ({ from: `${TMP}idx:prefix:${p}`, to: `idx:prefix:${p}` }));
    const allIndividualSwaps = [...tokenSwapList, ...prefixSwapList];

    for (let i = 0; i < allIndividualSwaps.length; i += REINDEX_CHUNK) {
      const chunk = allIndividualSwaps.slice(i, i + REINDEX_CHUNK);
      await Promise.all(chunk.map(s => safeSwap(s.from, s.to)));
    }
    
    // Master keys last
    await safeSwap(`${TMP}idx:all_ids`, "idx:all_ids");
    await safeSwap(`${TMP}idx:all_tokens`, "idx:all_tokens");

    // PHASE 4: Finalize
    await r.set("idx:last_size", tmpCount);
    await r.set("rebuild:last_success_ts", String(nowMs));
    await r.del("rebuild:fail_count").catch(() => null);
    await r.incr("places:version");
    await r.set("idx:meta:full_indexed", "true");

    // Audit History
    await r.lpush("rebuild:history", JSON.stringify({ reason, ts: nowMs })).catch(() => null);
    await r.ltrim("rebuild:history", 0, 49).catch(() => null);

    // Frequent Rebuild Guard
    const recent = await r.incr("rebuild:recent_count").catch(() => 0);
    if (recent === 1) await r.expire("rebuild:recent_count", 300);
    if (recent > 3) console.warn("[SearchEngine] High rebuild frequency alert!");

    const duration = Date.now() - tStart;
    console.info(`[SearchEngine] SUCCESS: ${tmpCount} places indexed in ${duration}ms (v${await r.get("places:version")})`);
  } catch (err) {
    console.error("[SearchEngine] FATAL REINDEX ERROR:", err);
  } finally {
    // Registry-based Cleanup
    try {
      const reg = await r.smembers(`${TMP}_registry`).catch(() => []);
      if (reg.length) {
        const cleanP = r.pipeline();
        reg.forEach(k => cleanP.unlink(k));
        await cleanP.exec();
        await r.unlink(`${TMP}_registry`);
      }
    } catch (_e) {
      // Best effort cleanup
    }
    const cur = await r.get("lock:full_reindex").catch(() => null);
    if (cur === lockOwner) await r.del("lock:full_reindex").catch(() => null);
  }
}

/**
 * ─── SEARCH ENGINE ──────────────────────────────────────────────────────────
 */

export async function adminSearch({
  search = "",
  location = "",
  filter = "all",
  page = 1,
  limit = 30,
  ip = "unknown"
}): Promise<SearchResult> {
  const t0 = Date.now();
  const redis = getRedis();

  // 1. FALLBACK (Redis Offline)
  if (!redis) {
    const { getInMemorySnapshot, getSnapshotUpdatedAt } = await import('./sharedPlacesCache');
    const snap = getInMemorySnapshot();
    const lastUpdate = getSnapshotUpdatedAt();
    if (Date.now() - lastUpdate > SNAPSHOT_FRESHNESS_LIMIT) console.warn("[AdminSearch] Stale snapshot fallback");
    const sorted = [...snap].sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { data: sorted.slice(0, Math.min(limit, 50)), total: snap.length, page, hasMore: snap.length > limit, source: 'snapshot', cacheStatus: 'error', latencyMs: Date.now() - t0 };
  }

  // 2. RATE LIMIT (20 req / 10s)
  const rateKey = `rate:admin:search:${ip}`;
  const rateCount = await redis.incr(rateKey).catch(() => 0);
  if (rateCount === 1) await redis.expire(rateKey, 10);
  if (rateCount > 20) throw new Error("RATE_LIMIT_EXCEEDED");

  // 3. CACHE LOOKUP
  const version = await redis.get<number>("places:version").catch(() => 0);
  const cacheKey = `search:v${version}:${hashKey(`${search}:${location}:${filter}:${page}:${limit}`)}`;
  const cached = await redis.get<string>(cacheKey).catch(() => null);
  if (cached) {
    const ids = cached.split(",").filter(Boolean);
    const start = (page - 1) * limit;
    const pageIds = ids.slice(start, start + limit);
    const data = await fetchPlacesChunked(pageIds);
    console.info('[AdminSearch] CACHE HIT', {
      key: cacheKey,
      search,
      location,
      filter,
      page,
      limit,
      docsReturned: data.length,
    });
    return { data, total: ids.length, page, hasMore: start + limit < ids.length, source: 'redis', cacheStatus: 'hit', latencyMs: Date.now() - t0 };
  }

  console.info('[AdminSearch] CACHE MISS', {
    key: cacheKey,
    search,
    location,
    filter,
    page,
    limit,
  });

  // 4. CORE SEARCH LOGIC (Prioritized Production Flow)
  let ids: string[] = [];
  let queryName = 'redis-index';

  if (search) {
    const isSingleWord = !search.includes(" ");
    const normalizedSearch = normalize(search);

    const queryLocation = async () => {
      const results = await redis.smembers(`idx:prefix:location_lower:${normalizedSearch}`).catch(() => []);
      return results;
    };

    const queryNamePrefix = async () => {
      const results = await redis.smembers(`idx:prefix:name_lower:${normalizedSearch}`).catch(() => []);
      return results;
    };

    const queryTokens = async () => {
      const tokens = tokenize(search);
      if (tokens.length === 0) return [];
      const tokenKeys = [...new Set(tokens)].map(t => `idx:token:${t}`);
      return await (redis as any).sinter(...tokenKeys).catch(() => []);
    };

    if (isSingleWord) {
      // Single word → location first
      ids = await queryLocation();
      queryName = 'prefix:location_lower';

      if (ids.length === 0) {
        ids = await queryNamePrefix();
        queryName = 'fallback:name_lower';
      }
    } else {
      // Multi-word → name first
      ids = await queryNamePrefix();
      queryName = 'prefix:name_lower';

      if (ids.length === 0) {
        ids = await queryLocation();
        queryName = 'fallback:location_lower';
      }
    }

    // Final fallback to token intersection if specialized prefix search failed
    if (ids.length === 0) {
      ids = await queryTokens();
      queryName = 'fallback:tokens';
    }

    // Prefix fallback for single word if still nothing
    if (ids.length === 0 && isSingleWord && normalizedSearch.length >= 2) {
      ids = await redis.smembers(`idx:prefix:${normalizedSearch}`).catch(() => []);
      queryName = 'fallback:generic-prefix';
    }
  } else if (location) {
    const normalizedLocation = normalize(location);
    ids = await redis.smembers(`idx:prefix:location_lower:${normalizedLocation}`).catch(() => []);
    queryName = 'prefix:location_lower';

    if (ids.length === 0) {
      const tokens = tokenize(location);
      if (tokens.length > 0) {
        const tokenKeys = [...new Set(tokens)].map(t => `idx:token:${t}`);
        ids = await (redis as any).sinter(...tokenKeys).catch(() => []);
        queryName = 'tokens:location';
      }
    }
  } else {
    ids = await redis.smembers("idx:all_ids").catch(() => []);
    queryName = 'all:ids';
  }

  // 5. DATA FETCH & FILTER
  const rawData = await fetchPlacesChunked(ids.slice(0, SEARCH_LIMIT));
  let filtered = rawData.filter(p => {
    if (location) {
      const loc = normalizeAdminStr(location);
      const inCity = (p.city || "").toLowerCase().includes(loc);
      const inArea = (p.area || "").toLowerCase().includes(loc);
      const inState = (p.state || "").toLowerCase().includes(loc);
      const inCountry = (p.country || "").toLowerCase().includes(loc);
      
      if (!(inCity || inArea || inState || inCountry)) return false;
    }
    const hasPhotos = (p.media?.length > 0) || !!p.coverImage;
    if (filter === "photos-added" && !hasPhotos) return false;
    if (filter === "photos-not-added" && hasPhotos) return false;
    return true;
  });

  // 6. RANKING
  filtered.sort((a, b) => {
    const s = search.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    if (aName === s && bName !== s) return -1;
    if (bName === s && aName !== s) return 1;
    if (aName.startsWith(s) && !bName.startsWith(s)) return -1;
    if (!aName.startsWith(s) && bName.startsWith(s)) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  // 7. PAGINATION & CACHE
  const start = (page - 1) * limit;
  const pageItems = filtered.slice(start, start + limit);
  const resultIds = filtered.map(f => f.id).join(",");

  if (resultIds.length < 100_000) {
    const jitter = Math.floor(Math.random() * (filtered.length === 0 ? 10 : 30));
    const ttl = filtered.length === 0 ? EMPTY_CACHE_TTL : CACHE_TTL;
    await redis.set(cacheKey, resultIds, { ex: ttl + jitter }).catch(() => null);
  }

  // 8. ANALYTICS (Zero-query tracking)
  const tokens = tokenize(search);
  if (filtered.length === 0 && tokens.length > 0) {
    const pattern = tokens.sort().join("_");
    await redis.zincrby("admin:zero_query_patterns", 1, pattern).catch(() => null);
    await redis.expire("admin:zero_query_patterns", 86400).catch(() => null);
  }

  console.info('[AdminSearch] QUERY RESULT', {
    queryName,
    search,
    isSingleWord: !search.includes(" "),
    docsReturned: pageItems.length,
    total: filtered.length,
    latencyMs: Date.now() - t0,
  });

  return {
    data: pageItems,
    total: filtered.length,
    page,
    hasMore: start + limit < filtered.length,
    source: 'redis',
    cacheStatus: 'miss',
    latencyMs: Date.now() - t0
  };
}

/**
 * ─── HELPERS ────────────────────────────────────────────────────────────────
 */

export function normalize(s: string) {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(s: string) {
  return normalize(s).split(/\s+/).filter(t => t.length >= 1);
}

function buildSearchable(p: any) {
  return `${p.name} ${p.area} ${p.city} ${p.state} ${p.country} ${p.category}`.toLowerCase();
}

function normalizeAdminStr(s: string) {
  return s.trim().toLowerCase();
}

function hashKey(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

async function fetchPlacesChunked(ids: string[]) {
  const redis = getRedis();
  if (!redis || !ids.length) return [];
  const results: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const p = redis.pipeline();
    chunk.forEach(id => p.get(`place:${id}`));
    const res = await p.exec() as any[];
    results.push(...res.map(r => (r && typeof r === 'object' && 'result' in r) ? r.result : r).filter(Boolean));
  }
  return results;
}

/**
 * ─── INDIVIDUAL UPDATES ──────────────────────────────────────────────────────
 */

/**
 * Updates or creates an index for a single place.
 */
export async function updatePlaceIndex(place: any) {
  const redis = getRedis();
  if (!redis) return;

  const id = place.id;
  const p = redis.pipeline();

  p.set(`place:${id}`, place);
  p.sadd("idx:all_ids", id);

  const tokens = [...new Set(tokenize(buildSearchable(place)))];
  for (const token of tokens) {
    p.sadd(`idx:token:${token}`, id);
    p.sadd("idx:all_tokens", token);
    for (let l = 1; l <= Math.min(token.length, 5); l++) {
      p.sadd(`idx:prefix:${token.slice(0, l)}`, id);
    }
  }

  // Specialized Prefix Indexing
  const nameLower = place.name_lower || normalize(place.name || place.Name);
  const locLower = place.location_lower || normalize([
    place.country || place.Country,
    place.state || place.State,
    place.city || place.City,
    place.area || place.Area
  ].filter(Boolean).join(' '));

  if (nameLower) {
    for (let l = 1; l <= Math.min(nameLower.length, 12); l++) {
      p.sadd(`idx:prefix:name_lower:${nameLower.slice(0, l)}`, id);
    }
  }
  if (locLower) {
    for (let l = 1; l <= Math.min(locLower.length, 12); l++) {
      p.sadd(`idx:prefix:location_lower:${locLower.slice(0, l)}`, id);
    }
  }

  await p.exec();
  await redis.incr("places:version").catch(() => null);
}

/**
 * Removes a place from the index.
 */
export async function deletePlaceIndex(id: string) {
  const redis = getRedis();
  if (!redis) return;

  const p = redis.pipeline();
  p.del(`place:${id}`);
  p.srem("idx:all_ids", id);

  // Note: For performance, we don't clean tokens on single delete.
  // Full re-index will clean them up.
  await p.exec();
  await redis.incr("places:version").catch(() => null);
}

/**
 * ─── LEGACY EXPORTS (FOR BACKWARD COMPATIBILITY) ───────────────────────────
 */

/**
 * Legacy positional wrapper for adminSearch used by public API.
 */
export async function searchPlaces(search: string = "", page: number = 1, location: string = "") {
  return adminSearch({
    search,
    location,
    page,
    limit: 24, // Default match for public API
  });
}

/**
 * Simple client-side fuzzy search for fallback.
 */
export function performFuzzySearch(places: any[], query: string) {
  if (!query) return places;
  return places
    .map((place) => ({ place, score: getScore(place, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.place);
}

export function fuzzyMatch(value: string, query: string) {
  const normalizedValue = normalize(value);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  if (normalizedValue.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedValue) {
    if (char === normalizedQuery[queryIndex]) queryIndex += 1;
    if (queryIndex === normalizedQuery.length) return true;
  }
  return false;
}

export function getScore(place: any, query: string) {
  const q = normalize(query);
  if (!q) return 1;

  const name = normalize(place.name || place.Name || '');
  const location = normalize([
    place.area || place.Area,
    place.city,
    place.state || place.State,
    place.country || place.Country,
  ].filter(Boolean).join(' '));
  const category = normalize(place.category || place.Category || '');
  const description = normalize(place.description || place.Description || '');
  const searchable = normalize([name, location, category, description].filter(Boolean).join(' '));

  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (location.includes(q)) return 45;
  if (category.includes(q)) return 35;
  if (description.includes(q)) return 20;
  return fuzzyMatch(searchable, q) ? 10 : 0;
}
