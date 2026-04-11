import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const SOURCE_TIMEOUT_MS = 8000;
const STATUS_CACHE_TTL_MS = 20000;

const statusCache: {
  data: any;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

let statusRefreshPromise: Promise<any> | null = null;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`System status source timed out: ${label}`));
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

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const now = Date.now();

    if (statusCache.data && now - statusCache.timestamp < STATUS_CACHE_TTL_MS) {
      return ok(statusCache.data);
    }

    if (statusCache.data) {
      void refreshSystemStatus();
      return ok(statusCache.data);
    }

    const fresh = await refreshSystemStatus();
    return ok(fresh);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get system status", 500);
  }
}

function refreshSystemStatus() {
  if (!statusRefreshPromise) {
    statusRefreshPromise = buildSystemStatus().finally(() => {
      statusRefreshPromise = null;
    });
  }

  return statusRefreshPromise;
}

async function buildSystemStatus() {
  const startedAt = Date.now();

  const firestoreStart = Date.now();
  const firestoreProbe = withTimeout(
    adminDb.collection("users").limit(1).get(),
    "firestore"
  )
    .then(() => ({ ok: true, ms: Date.now() - firestoreStart }))
    .catch(() => ({ ok: false, ms: Date.now() - firestoreStart }));

  const rtdbStart = Date.now();
  const rtdbProbe = (async () => {
    try {
      const rtdb = getAdminRtdb();

      const probes = await Promise.allSettled([
        withTimeout(rtdb.ref("status").limitToFirst(1).get(), "rtdb:status"),
        withTimeout(rtdb.ref("analytics/pageViews").get(), "rtdb:analytics/pageViews"),
        withTimeout(rtdb.ref("chatrooms").limitToFirst(1).get(), "rtdb:chatrooms"),
        withTimeout(rtdb.ref(".info/connected").get(), "rtdb:.info/connected"),
      ]);

      return {
        ok: probes.some((probe) => probe.status === "fulfilled"),
        ms: Date.now() - rtdbStart,
      };
    } catch (error: any) {
      if (process.env.NODE_ENV === "development") {
        console.warn("RTDB health probe failed:", error?.message || error);
      }

      return {
        ok: false,
        ms: Date.now() - rtdbStart,
      };
    }
  })();

  const [firestore, realtimeDb] = await Promise.all([firestoreProbe, rtdbProbe]);

  const totalMs = Date.now() - startedAt;

  const payload = {
    firebaseAuth: true,
    firestore,
    realtimeDb,
    responseTimeMs: totalMs,
  };

  statusCache.data = payload;
  statusCache.timestamp = Date.now();

  return payload;
}
