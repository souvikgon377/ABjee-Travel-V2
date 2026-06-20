import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import {
  hybridInvalidate,
  hybridInvalidatePattern,
  hybridInvalidateAll,
  hybridSet,
  getCacheStats,
} from "@/lib/server/hybridCache";
import { fetchStatsFromFirestore } from "@/app/api/admin/stats/service";
import { fetchUsersFromFirestore } from "@/app/api/admin/users/service";
import { fetchDashboardFromFirestore } from "@/app/api/admin/dashboard-data/service";
import { refreshSharedPlacesCache } from "@/lib/server/sharedPlacesCache";

export const runtime = "nodejs";

// ─── Concurrency & Rate Limiting ─────────────────────────────────────────────

const refreshLocks = new Map<string, number>(); // scope -> lastRefreshTimestamp
const REFRESH_DEBOUNCE_MS = 10_000; // 10 seconds

// ─── POST Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const body = await req.json() as { scope?: string; rewarm?: boolean };
    const scope = String(body.scope || "all").toLowerCase();
    const rewarm = body.rewarm !== false;

    // 1. Debounce / Rate Limiting
    const now = Date.now();
    const lastRefresh = refreshLocks.get(scope) || 0;
    if (now - lastRefresh < REFRESH_DEBOUNCE_MS) {
      return ok({
        status: "refresh_in_progress",
        message: `Refresh for "${scope}" is on cooldown.`,
        retryAfterSeconds: Math.ceil((REFRESH_DEBOUNCE_MS - (now - lastRefresh)) / 1000),
      });
    }
    refreshLocks.set(scope, now);

    const results: Record<string, any> = {};

    // 2. Execute Invalidation & Rewarm
    // Note: hybridCache v2 automatically adds CACHE_VERSION prefix to these raw keys.
    switch (scope) {
      case "places":
        await hybridInvalidatePattern("places:");
        if (rewarm) {
          results.rewarm = await refreshSharedPlacesCache().then(() => "ok").catch(e => `failed: ${e.message}`);
        }
        break;

      case "stats":
        await hybridInvalidate("admin:stats");
        if (rewarm) {
          const stats = await fetchStatsFromFirestore();
          await hybridSet("admin:stats", stats, { redisTtlSeconds: 300, memoryTtlSeconds: 120 });
          results.rewarm = "ok";
        }
        break;

      case "users":
        await hybridInvalidate("admin:users");
        if (rewarm) {
          const users = await fetchUsersFromFirestore();
          await hybridSet("admin:users", users, { redisTtlSeconds: 180, memoryTtlSeconds: 60 });
          results.rewarm = "ok";
        }
        break;

      case "dashboard":
        await hybridInvalidate("admin:dashboard");
        if (rewarm) {
          const dashboard = await fetchDashboardFromFirestore();
          await hybridSet("admin:dashboard", dashboard, { redisTtlSeconds: 180 });
          results.rewarm = "ok";
        }
        break;

      case "all":
        await hybridInvalidateAll();
        if (rewarm) {
          const rewarmResults = await Promise.allSettled([
            refreshSharedPlacesCache(),
            fetchStatsFromFirestore().then(s => hybridSet("admin:stats", s, { redisTtlSeconds: 300 })),
            fetchUsersFromFirestore().then(u => hybridSet("admin:users", u, { redisTtlSeconds: 180 })),
            fetchDashboardFromFirestore().then(d => hybridSet("admin:dashboard", d, { redisTtlSeconds: 180 })),
          ]);
          results.rewarm = rewarmResults.map(r => r.status);
        }
        break;

      default:
        return fail(`Unknown scope: "${scope}".`, 400);
    }

    const stats = await getCacheStats();

    return ok({
      message: `Cache refreshed: ${scope}`,
      status: "success",
      results,
      metrics: stats,
      healthScore: stats.hitRate,
      healthStatus: stats.healthStatus,
      invalidatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : "Failed to refresh cache";
    console.error("[Admin:RefreshCache] ERROR:", message);
    return fail(message, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const stats = await getCacheStats();

    return ok({
      metrics: stats,
      healthScore: stats.hitRate,
      healthStatus: stats.healthStatus,
      circuitOpen: stats.circuitOpen,
      locks: Array.from(refreshLocks.entries()).map(([s, t]) => ({ scope: s, lastRefresh: new Date(t).toISOString() })),
      checkedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get cache stats", 500);
  }
}
