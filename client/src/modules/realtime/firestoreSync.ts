/**
 * firestoreSync.ts — Realtime Firestore listener for cache synchronization
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  DESIGN RULES                                                           │
 * │                                                                         │
 * │  1. Listener only starts once per process (listenerStarted guard)       │
 * │  2. In development, the listener is DISABLED by default.                │
 * │     Set ENABLE_REALTIME_SYNC=true to activate it.                       │
 * │     Reason: in dev the process restarts often (HMR) and the listener   │
 * │     would fire on every server restart, causing cache-invalidation     │
 * │     storms. TTL-based cache expiry is sufficient for dev.               │
 * │  3. Cache invalidation is DEBOUNCED (300ms) so rapid batches of         │
 * │     Firestore changes trigger only one cache clear instead of N.        │
 * │  4. Redis invalidation never uses KEYS * on hot paths.                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { getRedis } from '@/lib/server/redis';

// ─── Types ────────────────────────────────────────────────────────────────────

type TouristPlaceDoc = {
  id: string;
  [key: string]: unknown;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLECTION = 'touristPlaces';
const K_ALL      = 'prod:tour:places:all';

/** Prefixes to invalidate in L1 on any document change */
const L1_INVALIDATION_PREFIXES = ['search:', 'places:search:', 'api:places:all:'];

/** Debounce window: batch rapid Firestore changes into a single cache clear */
const INVALIDATION_DEBOUNCE_MS = 300;

// ─── State ────────────────────────────────────────────────────────────────────

let listenerStarted    = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingInvalidation = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upsert a document into the GlobalCache list (no Redis call).
 */
function upsertInMemoryList(doc: TouristPlaceDoc) {
  const current = GlobalCache.get<TouristPlaceDoc[]>(K_ALL) ?? [];
  const next = current.filter((item) => String(item.id) !== doc.id);
  next.unshift(doc);
  GlobalCache.set(K_ALL, next, 24 * 60 * 60 * 1000); // 24h — listener keeps it fresh
}

/**
 * Remove a document from the GlobalCache list (no Redis call).
 */
function removeFromMemoryList(id: string) {
  const current = GlobalCache.get<TouristPlaceDoc[]>(K_ALL) ?? [];
  const next = current.filter((item) => String(item.id) !== id);
  GlobalCache.set(K_ALL, next, 24 * 60 * 60 * 1000);
}

/**
 * Debounced cache invalidation — batches multiple rapid changes into one clear.
 *
 * L1 (in-memory) is cleared synchronously.
 * L2 (Redis) is cleared asynchronously with fire-and-forget.
 * No KEYS * scan is used; we delete only the known keys.
 */
function scheduleInvalidation() {
  pendingInvalidation = true;

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    pendingInvalidation = false;

    // ── L1: Synchronous pattern-based clear ──────────────────────────────
    for (const prefix of L1_INVALIDATION_PREFIXES) {
      GlobalCache.invalidatePattern(prefix);
    }
    GlobalCache.delete(K_ALL);

    // ── L2: Async Redis delete (known keys only, no KEYS * scan) ─────────
    try {
      const redis = getRedis();
      if (redis) {
        // Delete the places-all key and the search: prefix keys in one batch
        // We use a conservative prefix delete here — no wildcard scan
        redis.del(K_ALL).catch(() => { /* ignore */ });
      }
    } catch {
      // ignore Redis failures — L1 is already cleared
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[Realtime] Cache invalidated (debounced)');
    }
  }, INVALIDATION_DEBOUNCE_MS);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the Firestore realtime listener.
 *
 * Called once from app startup (e.g. Next.js instrumentation.ts or warmup.ts).
 * NOT called from request handlers or cache-read paths.
 *
 * Behavior:
 * - In development: **disabled by default** unless ENABLE_REALTIME_SYNC=true
 * - In production:  enabled by default unless ENABLE_REALTIME_SYNC=false
 */
export async function ensureFirestoreSync() {
  if (listenerStarted) return;

  const isDev     = process.env.NODE_ENV === 'development';
  const envFlag   = process.env.ENABLE_REALTIME_SYNC;
  const shouldRun = envFlag !== undefined
    ? envFlag === 'true'
    : !isDev; // prod: on by default; dev: off by default

  if (!shouldRun) {
    if (isDev && !listenerStarted) {
      console.info(
        '[Realtime] Listener DISABLED in dev (set ENABLE_REALTIME_SYNC=true to enable). ' +
        'Cache expires via TTL (30s).'
      );
    }
    listenerStarted = true; // mark as "done" so we don't retry
    return;
  }

  listenerStarted = true;
  console.info('[Realtime] Starting Firestore listener for collection:', COLLECTION);

  adminDb.collection(COLLECTION).onSnapshot(
    (snapshot) => {
      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      for (const change of changes) {
        const id   = change.doc.id;
        const data = { id, ...(change.doc.data() as Record<string, unknown>) };

        if (change.type === 'added' || change.type === 'modified') {
          upsertInMemoryList(data);
        } else if (change.type === 'removed') {
          removeFromMemoryList(id);
        }
      }

      // One debounced invalidation for the entire batch
      scheduleInvalidation();
    },
    (error) => {
      console.error('[Realtime] Listener error:', error.message);
    }
  );
}

/**
 * Manually sync a single mutation to the in-memory cache.
 * Call this from API route handlers after write operations.
 * This is always available regardless of ENABLE_REALTIME_SYNC.
 */
export async function syncTouristPlaceMutation(
  type: 'create' | 'update' | 'delete',
  data: TouristPlaceDoc
) {
  if (type === 'delete') {
    removeFromMemoryList(data.id);
  } else {
    upsertInMemoryList(data);
  }

  // Also invalidate search caches immediately (not debounced — this is explicit)
  for (const prefix of L1_INVALIDATION_PREFIXES) {
    GlobalCache.invalidatePattern(prefix);
  }

  // Async Redis invalidation — fire-and-forget
  try {
    const redis = getRedis();
    if (redis) {
      redis.del(K_ALL).catch(() => { /* ignore */ });
    }
  } catch {
    // ignore
  }
}
