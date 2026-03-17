import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const usersSnapshot = await adminDb.collection("users").get();
    const totalUsers = usersSnapshot.size;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsersSnapshot = await adminDb.collection("users").where("lastSeen", ">", thirtyDaysAgo).get();
    const activeUsers = activeUsersSnapshot.size;

    const subscriptionsSnapshot = await adminDb.collection("subscriptions").get();
    const subscriptions = subscriptionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() as Record<string, any> }));

    const activeSubscriptions = subscriptions.filter((subscription) => {
      if (!subscription.expiresAt) return false;
      const expiry = subscription.expiresAt?.toDate?.() || new Date(subscription.expiresAt);
      return expiry > new Date();
    });

    const planPrice: Record<string, number> = { basic: 9.99, pro: 19.99, premium: 29.99 };
    const revenueTotal = activeSubscriptions.reduce(
      (sum, subscription) => sum + (planPrice[String(subscription.type)] || 0),
      0
    );

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const revenueMonthly = activeSubscriptions
      .filter((subscription) => {
        const createdAt = subscription.createdAt?.toDate?.() || new Date(0);
        return createdAt >= thisMonth;
      })
      .reduce((sum, subscription) => sum + (planPrice[String(subscription.type)] || 0), 0);

    return ok({
      totalUsers,
      activeUsers,
      revenue: revenueTotal,
      monthlyRevenue: revenueMonthly,
      pageViews: 0,
      activeSubscriptions: activeSubscriptions.length,
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
          total: activeSubscriptions.length,
          basic: activeSubscriptions.filter((subscription) => subscription.type === "basic").length,
          pro: activeSubscriptions.filter((subscription) => subscription.type === "pro").length,
          premium: activeSubscriptions.filter((subscription) => subscription.type === "premium").length,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get dashboard statistics", 500);
  }
}
