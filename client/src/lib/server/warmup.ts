import { fetchStatsFromFirestore } from "@/app/api/admin/stats/route";
import { fetchUsersFromFirestore } from "@/app/api/admin/users/route";
import { fetchDashboardFromFirestore } from "@/app/api/admin/dashboard-data/route";
import { refreshSharedPlacesCache } from "@/lib/server/sharedPlacesCache";
import { hybridSet } from "./hybridCache";
import { getRedis } from "./redis";

/**
 * warmup.ts — Background cache re-warming for serverless instances.
 * 
 * Multi-instance Safe: Uses a Redis SETNX lock to ensure only one instance 
 * performs the heavy hydration globally.
 */

const WARMUP_LOCK_KEY = "lock:global_warmup";
const LOCK_TTL_SECONDS = 600; // 10 minutes

let isLocalWarmedUp = false;

export async function triggerBackgroundWarmup() {
  if (isLocalWarmedUp) return;
  isLocalWarmedUp = true;

  const redis = getRedis();
  if (!redis) return;

  // 1. Acquire Global Lock (NX = Only if not exists, EX = Expiry)
  // This prevents multiple Vercel instances from hammering Firestore simultaneously.
  try {
    const lockAcquired = await redis.set(WARMUP_LOCK_KEY, "locked", { 
      nx: true, 
      ex: LOCK_TTL_SECONDS 
    });

    if (!lockAcquired) {
      console.info("[Warmup] Global lock already held by another instance. Skipping.");
      return;
    }

    console.info("[Warmup] Lock acquired. Starting background hydration...");

    // 2. Perform Hydration in Background
    void (async () => {
      try {
        await Promise.all([
          fetchStatsFromFirestore().then(s => hybridSet("admin:stats", s, { redisTtlSeconds: 300 })),
          fetchDashboardFromFirestore().then(d => hybridSet("admin:dashboard", d, { redisTtlSeconds: 180 })),
          fetchUsersFromFirestore().then(u => hybridSet("admin:users", u, { redisTtlSeconds: 180 })),
          refreshSharedPlacesCache()
        ]);

        // Start the real-time Firestore sync once per instance so L1/L2 caches stay aligned.
        const { ensureFirestoreSync } = await import("@/modules/realtime/firestoreSync");
        void ensureFirestoreSync();

        console.info("[Warmup] SUCCESS | All critical caches hydrated.");
      } catch (err) {
        console.warn("[Warmup] FAILED | One or more keys failed to hydrate:", err);
        // Release lock on failure so another instance can retry
        await redis.del(WARMUP_LOCK_KEY);
        isLocalWarmedUp = false;
      }
    })();

  } catch (err) {
    console.error("[Warmup] Redis lock acquisition error:", err);
    isLocalWarmedUp = false;
  }
}
