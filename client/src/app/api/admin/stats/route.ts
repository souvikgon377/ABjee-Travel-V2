import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";

export const runtime = "nodejs";

// Simple in-memory cache for stats
const statsCache: {
  data: any;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 30000; // Cache for 30 seconds
const SOURCE_TIMEOUT_MS = 8000;

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const now = Date.now();

    // Return cached data if fresh (30 second cache)
    if (statsCache.data && now - statsCache.timestamp < CACHE_TTL_MS) {
      return ok(statsCache.data);
    }

    // First request or cache expired - fetch data and wait
    await fetchStatsInBackground();
    return ok(statsCache.data || getDefaultStats());
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get dashboard statistics", 500);
  }
}

/**
 * Get default empty stats
 */
function getDefaultStats() {
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

/**
 * Fetch stats in background - cached for 30 seconds
 * Uses limits and optimized queries to speed up response
 */
async function fetchStatsInBackground() {
  try {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    // Fetch all data in parallel, but let each source fail independently.
    const [usersResult, statusResult, pageViewsResult, paymentsResult, subscriptionsResult] =
      await Promise.allSettled([
        withTimeout(adminDb.collection("users").limit(10000).get(), "users"),
        withTimeout(getAdminRtdb().ref("status").get(), "status"),
        withTimeout(getAdminRtdb().ref("analytics/pageViews").get(), "pageViews"),
        withTimeout(adminDb.collection("subscriptionPayments").limit(5000).get(), "subscriptionPayments"),
        withTimeout(adminDb.collection("subscriptions").limit(10000).get(), "subscriptions"),
      ]);

    const usersSnapshot = usersResult.status === "fulfilled" ? usersResult.value : null;
    const statusSnapshot = statusResult.status === "fulfilled" ? statusResult.value : null;
    const pageViewsSnapshot = pageViewsResult.status === "fulfilled" ? pageViewsResult.value : null;
    const paidPaymentsSnapshot = paymentsResult.status === "fulfilled" ? paymentsResult.value : null;
    const subscriptionsSnapshot = subscriptionsResult.status === "fulfilled" ? subscriptionsResult.value : null;

    const totalUsers = usersSnapshot?.size || 0;

    const statusData = (statusSnapshot?.val() || {}) as Record<string, any>;
    const activeUsers = Object.values(statusData).filter((entry) => {
      const online = entry?.online === true || entry?.isOnline === true;
      const recentlySeen =
        typeof entry?.lastSeen === "number" && entry.lastSeen >= fiveMinAgo;
      return online || recentlySeen;
    }).length;

    let revenueTotal = 0;
    let revenueMonthly = 0;

    const paidPaymentDocs =
      paidPaymentsSnapshot?.docs.filter((doc) => {
        const payment = doc.data() as Record<string, any>;
        return String(payment.status) === "paid";
      }) || [];

    if (paidPaymentDocs.length > 0) {
      paidPaymentDocs.forEach((doc) => {
        const payment = doc.data() as Record<string, any>;
        const amountInPaise =
          typeof payment.amountInPaise === "number"
            ? payment.amountInPaise
            : null;
        const amount =
          amountInPaise !== null
            ? amountInPaise / 100
            : typeof payment.amount === "number"
              ? payment.amount
              : 0;

        revenueTotal += amount;

        const createdAt = payment.verifiedAt
          ? new Date(payment.verifiedAt)
          : payment.createdAt?.toDate?.()
            ? payment.createdAt.toDate()
            : payment.createdAt
              ? new Date(payment.createdAt)
              : null;

        if (createdAt && createdAt >= thisMonth) {
          revenueMonthly += amount;
        }
      });
    } else {
      const subscriptions = subscriptionsSnapshot?.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>),
      })) || [];
      const activeSubscriptions = subscriptions.filter((subscription) => {
        if (!subscription.expiresAt) return false;
        const expiry =
          subscription.expiresAt?.toDate?.() ||
          new Date(subscription.expiresAt);
        return expiry > new Date();
      });

      const planPrice: Record<string, number> = {
        basic: 9.99,
        pro: 19.99,
        premium: 29.99,
      };
      revenueTotal = activeSubscriptions.reduce(
        (sum, subscription) =>
          sum + (planPrice[String(subscription.type)] || 0),
        0
      );

      revenueMonthly = activeSubscriptions
        .filter((subscription) => {
          const createdAt =
            subscription.createdAt?.toDate?.() || new Date(0);
          return createdAt >= thisMonth;
        })
        .reduce(
          (sum, subscription) =>
            sum + (planPrice[String(subscription.type)] || 0),
          0
        );
    }

    const pageViewsRaw = pageViewsSnapshot?.val();
    const pageViews =
      typeof pageViewsRaw === "number" ? pageViewsRaw : Number(pageViewsRaw || 0);

    // Update cache with fresh data
    statsCache.data = {
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
          growth:
            totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : "0",
        },
        revenue: {
          total: revenueTotal.toFixed(2),
          monthly: revenueMonthly.toFixed(2),
          growth:
            revenueTotal > 0
              ? ((revenueMonthly / revenueTotal) * 100).toFixed(1)
              : "0",
        },
        subscriptions: {
          total: subscriptionsSnapshot?.size || 0,
          basic: subscriptionsSnapshot?.docs.filter(
            (doc) =>
              String((doc.data() as Record<string, unknown>).type) ===
              "basic"
          ).length || 0,
          pro: subscriptionsSnapshot?.docs.filter(
            (doc) =>
              String((doc.data() as Record<string, unknown>).type) === "pro"
          ).length || 0,
          premium: subscriptionsSnapshot?.docs.filter(
            (doc) =>
              String((doc.data() as Record<string, unknown>).type) ===
              "premium"
          ).length || 0,
        },
      },
    };

    statsCache.timestamp = now;
  } catch (error) {
    console.error("Error fetching stats:", error);
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Stats source timed out: ${label}`));
    }, SOURCE_TIMEOUT_MS);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}
