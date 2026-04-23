/**
 * useServerData.ts — Lightweight client-side fetch deduplication hooks
 *
 * Provides React hooks with:
 * - In-module request deduplication (one fetch per key, even across components)
 * - Stale-while-revalidate pattern (return cached data instantly, refresh in background)
 * - Configurable revalidation interval
 * - Error handling with retry
 *
 * No external dependency (SWR/React Query not installed).
 * Designed to work with the server-side hybridCache for full-stack read reduction.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── In-module deduplication ──────────────────────────────────────────────────
// Prevents multiple mounted components from triggering the same fetch simultaneously.
// Key: URL string | Value: in-flight Promise
const inFlight = new Map<string, Promise<unknown>>();

// ─── Stale cache ──────────────────────────────────────────────────────────────
// Stores last-known-good response per URL.
// Survived across re-mounts within the same page session.
type CacheEntry<T> = { data: T; fetchedAt: number };
const clientCache = new Map<string, CacheEntry<unknown>>();

type UseServerDataOptions = {
  /** Revalidation interval in ms. 0 = no background refresh. Default: 60_000 (1 min) */
  revalidateMs?: number;
  /** If true, skip cache and always fetch fresh. Default: false */
  forceRefresh?: boolean;
  /** Bearer token for Authorization header */
  token?: string | null;
  /** Whether to fetch at all. Useful for conditional fetching. Default: true */
  enabled?: boolean;
};

type UseServerDataResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useServerData<T>(
  url: string | null,
  options?: UseServerDataOptions,
): UseServerDataResult<T> {
  const {
    revalidateMs = 60_000,
    forceRefresh = false,
    token = null,
    enabled = true,
  } = options ?? {};

  const [data, setData] = useState<T | null>(() => {
    if (!url) return null;
    const cached = clientCache.get(url) as CacheEntry<T> | undefined;
    return cached?.data ?? null;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(
    async (background = false) => {
      if (!url || !enabled) return;

      // Serve stale immediately while refreshing in background
      const stale = clientCache.get(url) as CacheEntry<T> | undefined;
      if (stale && background) {
        setData(stale.data);
      }

      if (!background) setLoading(true);

      // ── Deduplication ──────────────────────────────────────────────────────
      let fetchPromise = inFlight.get(url) as Promise<T> | undefined;
      if (!fetchPromise) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const urlWithRefresh = forceRefresh
          ? `${url}${url.includes("?") ? "&" : "?"}forceRefresh=true`
          : url;

        fetchPromise = fetch(urlWithRefresh, { headers })
          .then(async (res) => {
            if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
            const json = await res.json() as { data?: T } | T;
            // Handle both { data: T } and raw T response shapes
            return (typeof json === "object" && json !== null && "data" in json
              ? (json as { data: T }).data
              : json) as T;
          })
          .finally(() => {
            inFlight.delete(url);
          }) as Promise<T>;

        inFlight.set(url, fetchPromise as Promise<unknown>);
      }

      try {
        const result = await fetchPromise;
        if (!mountedRef.current) return;
        clientCache.set(url, { data: result, fetchedAt: Date.now() });
        setData(result);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : "Fetch failed";
        setError(msg);
        // Don't clear data on error — keep showing stale
        console.warn(`[useServerData] Error fetching ${url}:`, msg);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, token, enabled, forceRefresh],
  );

  useEffect(() => {
    mountedRef.current = true;

    // Check if cached data is stale
    const stale = clientCache.get(url ?? "") as CacheEntry<T> | undefined;
    const isStale = !stale || Date.now() - stale.fetchedAt > (revalidateMs || Infinity);

    if (isStale || forceRefresh) {
      void fetchData(!!stale); // background=true if we have stale data
    } else if (stale) {
      setData(stale.data);
      setLoading(false);
    }

    // Background revalidation interval
    if (!revalidateMs) return;
    const interval = setInterval(() => void fetchData(true), revalidateMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [url, fetchData, forceRefresh, revalidateMs]);

  const refetch = useCallback(() => void fetchData(false), [fetchData]);

  return { data, loading, error, refetch };
}

// ─── Pre-built hooks ──────────────────────────────────────────────────────────

type AdminStatsData = {
  totalUsers: number;
  activeUsers: number;
  revenue: number;
  monthlyRevenue: number;
  pageViews: number;
  paidTransactions: number;
  stats: {
    users: { total: number; active: number; growth: string };
    revenue: { total: string; monthly: string; growth: string };
    subscriptions: { total: number; basic: number; pro: number; premium: number };
  };
};

/**
 * Hook for admin stats — revalidates every 5 minutes (matching server cache TTL).
 * Multiple components calling this hook share the same in-flight request.
 */
export function useAdminStats(token: string | null) {
  return useServerData<AdminStatsData>("/api/admin/stats", {
    token,
    revalidateMs: 5 * 60 * 1000, // 5 minutes
    enabled: !!token,
  });
}

type AdminUsersData = {
  users: Record<string, unknown>[];
  pagination: { total: number; page: number; limit: number; pages: number };
};

/**
 * Hook for admin users list — revalidates every 3 minutes.
 */
export function useAdminUsers(token: string | null, page = 1, search = "") {
  const url = token
    ? `/api/admin/users?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ""}`
    : null;
  return useServerData<AdminUsersData>(url, {
    token,
    revalidateMs: 3 * 60 * 1000,
    enabled: !!token,
  });
}

type DashboardData = {
  stats: AdminStatsData;
  recentUsers: Record<string, unknown>[];
  subscriptionsSummary: {
    total: number; basic: number; pro: number; premium: number; active: number;
  };
};

/**
 * Hook for merged admin dashboard data — single API call replacing 3-5 separate fetches.
 */
export function useAdminDashboard(token: string | null) {
  return useServerData<DashboardData>("/api/admin/dashboard-data", {
    token,
    revalidateMs: 3 * 60 * 1000,
    enabled: !!token,
  });
}
