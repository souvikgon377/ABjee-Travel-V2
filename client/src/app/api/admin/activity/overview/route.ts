import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";

export const runtime = "nodejs";

const CACHE_TTL_MS = 30_000;

const cache: {
  data: any;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function relativeTime(ms: number): string {
  if (!ms) return "just now";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
      return ok(cache.data);
    }

    const [usersSnap, statusSnap] = await Promise.all([
      adminDb.collection("users").limit(200).get(),
      getAdminRtdb().ref("status").limitToFirst(500).get(),
    ]);

    const profiles = usersSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;
      return {
        id: doc.id,
        displayName: String(data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim()),
        username: String(data.username || ""),
        email: String(data.email || ""),
        area: String(data.area || data.address || ""),
        state: String(data.state || data.province || ""),
        country: String(data.country || ""),
        city: String(data.city || ""),
      };
    });

    const activityRows: Array<{
      id: string;
      userId: string | null;
      action: string;
      user: string;
      timestamp: string;
      time: string;
      color: string;
      kind: "registration" | "presence";
      _ts: number;
    }> = [];

    usersSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, any>;
      const ts = toMillis(data.createdAt);
      if (!ts) return;

      activityRows.push({
        id: `register-${doc.id}`,
        userId: doc.id,
        action: `New user registered: ${String(data.displayName || data.email || "Unknown")}`,
        user: String(data.email || data.username || "Unknown"),
        timestamp: new Date(ts).toISOString(),
        time: relativeTime(ts),
        color: "text-blue-500",
        kind: "registration",
        _ts: ts,
      });
    });

    const statusData = (statusSnap.val() || {}) as Record<string, any>;
    Object.entries(statusData).forEach(([uid, s]) => {
      const ts = toMillis(s?.lastSeen);
      if (!ts) return;
      const username = String(s?.username || "Unknown");
      activityRows.push({
        id: `status-${uid}-${ts}`,
        userId: uid,
        action: `Presence update: ${username}`,
        user: username,
        timestamp: new Date(ts).toISOString(),
        time: relativeTime(ts),
        color: "text-purple-500",
        kind: "presence",
        _ts: ts,
      });
    });

    const activities = activityRows
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 600)
      .map(({ _ts, ...rest }) => rest);

    const payload = {
      profiles,
      activities,
      generatedAt: new Date().toISOString(),
      capped: true,
      limits: {
        users: 200,
        status: 500,
        activities: 600,
      },
    };

    cache.data = payload;
    cache.timestamp = Date.now();

    return ok(payload);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to fetch activity overview", 500);
  }
}
