import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

const CACHE_TTL_MS = 45_000;

const cache: {
  data: any;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

async function safeCount(collectionName: string): Promise<number> {
  try {
    const aggregate = await adminDb.collection(collectionName).count().get();
    return Number(aggregate.data().count || 0);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
      return ok(cache.data);
    }

    const [
      users,
      stories,
      touristPlaces,
      itineraries,
      notifications,
      subscriptions,
      subPayments,
      adPayments,
    ] = await Promise.all([
      safeCount("users"),
      safeCount("stories"),
      safeCount("touristPlaces"),
      safeCount("travel-destinations"),
      safeCount("notifications"),
      safeCount("subscriptions"),
      safeCount("subscriptionPayments"),
      safeCount("advertisementPayments"),
    ]);

    const payments = subPayments + adPayments;

    const footprintScore = Math.min(
      100,
      Math.round((stories + touristPlaces + itineraries + notifications + subscriptions) / 200)
    );

    const payload = {
      generatedAt: new Date().toISOString(),
      datasetCounts: {
        users,
        stories,
        touristPlaces,
        itineraries,
        notifications,
        subscriptions,
        payments,
      },
      risk: {
        score: footprintScore,
        level: footprintScore >= 80 ? "high" : footprintScore >= 50 ? "moderate" : "low",
        note:
          footprintScore >= 80
            ? "Use strict limits for admin exports and avoid full scans."
            : "Quota posture is manageable with capped queries.",
      },
      safeguards: {
        exportPageSize: 200,
        maxExportRowsPerSection: 1000,
        adminPollIntervalSeconds: 60,
      },
    };

    cache.data = payload;
    cache.timestamp = Date.now();

    return ok(payload);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to fetch quota telemetry", 500);
  }
}
