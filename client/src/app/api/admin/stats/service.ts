import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok, withCacheHeaders } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";
import { hybridGet } from "@/lib/server/hybridCache";
import { triggerBackgroundWarmup } from "@/lib/server/warmup";
import { checkAdminRateLimit } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";

// ─── Cache Config ─────────────────────────────────────────────────────────────
// hybridGet handles: L1 memory (2-min) → L2 Redis (5-min) → fetcher (Firestore)
// All instances share the Redis key — cold starts no longer re-run all queries.
const STATS_CACHE_KEY = "admin:stats";
const STATS_REDIS_TTL = 300;   // 5 minutes
const STATS_MEMORY_TTL = 120;  // 2 minutes
const SOURCE_TIMEOUT_MS = 10000; // 10 seconds per Firestore/RTDB query

type StatsData = {
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
  cachedAt?: number;
};

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Query timed out: ${label}`));
    }, SOURCE_TIMEOUT_MS);
    promise
      .then((v) => { clearTimeout(timeoutId); resolve(v); })
      .catch((e) => { clearTimeout(timeoutId); reject(e); });
  });
}

function getDefaultStats(): StatsData {
  return {
    totalUsers: 0,
    activeUsers: 0,
    revenue: 0,
    monthlyRevenue: 0,
    pageViews: 0,
    paidTransactions: 0,
    stats: {
      users: { total: 0, active: 0, growth: "0" },
      revenue: { total: "0", monthly: "0", growth: "0" },
      subscriptions: { total: 0, basic: 0, pro: 0, premium: 0 },
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    // 1. Rate Limiting
    const limit = await checkAdminRateLimit(user.id);
    if (!limit.success) {
      return fail("Too many requests. Please wait.", 429);
    }

    // 2. Background Warm-up (non-blocking)
    void triggerBackgroundWarmup();

    const forceRefresh = req.nextUrl.searchParams.get("forceRefresh") === "true";

    // hybridGet: L1 memory → L2 Redis → fetchStatsFromFirestore (with in-flight dedup)
    // On cache hit: zero Firestore reads. On miss: all instances share the same fetch.
    const data = await hybridGet<StatsData>(
      STATS_CACHE_KEY,
      fetchStatsFromFirestore,
      { redisTtlSeconds: STATS_REDIS_TTL, memoryTtlSeconds: STATS_MEMORY_TTL, forceRefresh },
    );

    const res = ok(data);
    return withCacheHeaders(res, 60, 300);
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : "Failed to load stats";
    console.error("[Admin:Stats] Error:", message);
    // Return defaults so admin UI is never blocked
    return ok(getDefaultStats());
  }
}

// ─── Firestore fetcher ────────────────────────────────────────────────────────
// Called only on cache miss. In-flight deduplication in hybridGet ensures
// only one Firestore read occurs even if N requests arrive simultaneously.
export async function fetchStatsFromFirestore(): Promise<StatsData> {
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  // users: count() = 1 read regardless of collection size (vs limit(1000) = 1000 reads)
  const [
    usersCountResult,
    statusResult,
    pageViewsResult,
    paymentsResult,
    adPaymentsResult,
    subscriptionsResult,
  ] = await Promise.allSettled([
    withTimeout(adminDb.collection("users").count().get(), "users-count"),
    withTimeout(getAdminRtdb().ref("status").limitToFirst(500).get() as any, "status"),
    withTimeout(getAdminRtdb().ref("analytics/pageViews").get() as any, "pageViews"),
    withTimeout(
      adminDb.collection("subscriptionPayments").limit(500).get(),
      "subscriptionPayments",
    ),
    withTimeout(
      adminDb.collection("advertisementPayments").limit(500).get(),
      "advertisementPayments",
    ),
    withTimeout(adminDb.collection("subscriptions").limit(500).get(), "subscriptions"),
  ]);

  const totalUsers =
    usersCountResult.status === "fulfilled"
      ? ((usersCountResult.value as any).data() as { count: number }).count
      : 0;

  const statusSnapshot = statusResult.status === "fulfilled" ? (statusResult.value as any) : null;
  const pageViewsSnapshot = pageViewsResult.status === "fulfilled" ? (pageViewsResult.value as any) : null;
  const paidPaymentsSnapshot = paymentsResult.status === "fulfilled" ? paymentsResult.value : null;
  const paidAdPaymentsSnapshot = adPaymentsResult.status === "fulfilled" ? adPaymentsResult.value : null;
  const subscriptionsSnapshot = subscriptionsResult.status === "fulfilled" ? subscriptionsResult.value : null;

  const statusData = ((statusSnapshot as any)?.val() || {}) as Record<string, unknown>;
  const activeUsers = Object.values(statusData).filter((entry) => {
    const e = entry as Record<string, unknown> | null;
    const online = e?.online === true || e?.isOnline === true;
    const recentlySeen = typeof e?.lastSeen === "number" && (e.lastSeen as number) >= fiveMinAgo;
    return online || recentlySeen;
  }).length;

  let revenueTotal = 0;
  let revenueMonthly = 0;

  const paidPaymentDocs = [
    ...((paidPaymentsSnapshot as any)?.docs || []),
    ...((paidAdPaymentsSnapshot as any)?.docs || []),
  ].filter((doc: any) => {
    const payment = doc.data() as Record<string, unknown>;
    return String(payment.status) === "paid";
  });

  if (paidPaymentDocs.length > 0) {
    paidPaymentDocs.forEach((doc: any) => {
      const payment = doc.data() as Record<string, unknown>;
      const amountInPaise = typeof payment.amountInPaise === "number" ? payment.amountInPaise : null;
      const amount =
        amountInPaise !== null
          ? amountInPaise / 100
          : typeof payment.amount === "number"
            ? payment.amount
            : 0;
      revenueTotal += amount;
      
      // Get payment date from updatedAt field
      const updatedAtStr = payment.updatedAt as string | undefined;
      const createdAtStr = payment.createdAt as string | undefined;
      const updatedDate = updatedAtStr ? new Date(updatedAtStr) : null;
      const createdDate = createdAtStr ? new Date(createdAtStr) : null;
      const paymentDate = updatedDate || createdDate;
      
      if (paymentDate && paymentDate >= thisMonth) revenueMonthly += amount;
    });
  } else {
    type SubDoc = { id: string } & Record<string, unknown>;
    const subscriptions: SubDoc[] = (subscriptionsSnapshot as any)?.docs.map((doc: any) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    })) ?? [];
    const planPrice: Record<string, number> = { basic: 9.99, pro: 19.99, premium: 29.99 };
    const activeSubscriptions = subscriptions.filter((s) => {
      if (!s.expiresAt) return false;
      const expiry = (s.expiresAt as { toDate?: () => Date })?.toDate?.() ?? new Date(s.expiresAt as string);
      return expiry > new Date();
    });
    revenueTotal = activeSubscriptions.reduce((sum, s) => sum + (planPrice[String(s.type)] || 0), 0);
    revenueMonthly = activeSubscriptions
      .filter((s) => {
        const ca = (s.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(0);
        return ca >= thisMonth;
      })
      .reduce((sum, s) => sum + (planPrice[String(s.type)] || 0), 0);
  }

  const pageViewsRaw = (pageViewsSnapshot as any)?.val();
  const pageViews = typeof pageViewsRaw === "number" ? pageViewsRaw : Number(pageViewsRaw || 0);

  const data: StatsData = {
    totalUsers,
    activeUsers,
    revenue: revenueTotal,
    monthlyRevenue: revenueMonthly,
    pageViews,
    paidTransactions: paidPaymentDocs.length,
    stats: {
      users: {
        total: totalUsers,
        active: activeUsers,
        growth: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : "0",
      },
      revenue: {
        total: revenueTotal.toFixed(2),
        monthly: revenueMonthly.toFixed(2),
        growth: revenueTotal > 0 ? ((revenueMonthly / revenueTotal) * 100).toFixed(1) : "0",
      },
      subscriptions: {
        total: (subscriptionsSnapshot as any)?.size || 0,
        basic: (subscriptionsSnapshot as any)?.docs.filter(
          (doc: any) => String((doc.data() as Record<string, unknown>).type) === "basic",
        ).length || 0,
        pro: (subscriptionsSnapshot as any)?.docs.filter(
          (doc: any) => String((doc.data() as Record<string, unknown>).type) === "pro",
        ).length || 0,
        premium: (subscriptionsSnapshot as any)?.docs.filter(
          (doc: any) => String((doc.data() as Record<string, unknown>).type) === "premium",
        ).length || 0,
      },
    },
    cachedAt: Date.now(),
  };

  console.info("[Admin:Stats] Fetched fresh from Firestore", { totalUsers, activeUsers });
  return data;
}
