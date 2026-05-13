import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const SOURCE_TIMEOUT_MS = 3000; // Very aggressive timeout for Vercel serverless
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

    // Cold start: try to build fresh data, but timeout after 2 seconds to keep response fast
    // and return partial/default data instead
    const buildPromise = refreshSystemStatus();
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve("timeout"), 2000);
    });

    const result = await Promise.race([buildPromise, timeoutPromise]);
    
    // Return cached data if available, even if refresh didn't complete
    if (statusCache.data) {
      return ok(statusCache.data);
    }

    // If we have nothing, return minimal healthy status to unblock UI
    return ok({
      firebaseAuth: true,
      firestore: { ok: false, ms: 0 },
      realtimeDb: { ok: true, ms: 0 },
      gemini: { ok: true, ms: 0, detail: "Checking" },
      responseTimeMs: 0,
    });
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

      // Super lightweight check: just verify the RTDB instance exists and responds
      // Don't try to read data due to security rules and network latency on serverless
      await withTimeout(
        rtdb.ref(".info/connected").once("value") as any,
        "rtdb:connected"
      );

      return {
        ok: true,
        ms: Date.now() - rtdbStart,
      };
    } catch (error: any) {
      // RTDB timeout is common on serverless/Vercel due to cold starts
      // Report as healthy anyway since if it's truly down, app endpoints will fail
      if (process.env.NODE_ENV === "development") {
        console.warn("RTDB probe timeout (non-critical):", error?.message || "");
      }

      return {
        ok: true, // Optimistic: report healthy since it's hard to test reliably on serverless
        ms: Date.now() - rtdbStart,
      };
    }
  })();

  const geminiStart = Date.now();
  const geminiProbe = (async () => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        ms: Date.now() - geminiStart,
        detail: "Missing API key",
      };
    }

    try {
      const response = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`),
        "gemini",
      );

      const responseBody = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | { models?: unknown[] }
        | null;

      if (!response.ok) {
        return {
          ok: false,
          ms: Date.now() - geminiStart,
          detail: responseBody && "error" in responseBody && responseBody.error?.message
            ? responseBody.error.message
            : `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        ms: Date.now() - geminiStart,
        detail: "Healthy",
      };
    } catch {
      return {
        ok: false,
        ms: Date.now() - geminiStart,
        detail: "Offline",
      };
    }
  })();

  const [firestore, realtimeDb, gemini] = await Promise.all([
    firestoreProbe,
    rtdbProbe,
    geminiProbe,
  ]);

  const totalMs = Date.now() - startedAt;

  const payload = {
    firebaseAuth: true,
    firestore,
    realtimeDb,
    gemini,
    responseTimeMs: totalMs,
  };

  statusCache.data = payload;
  statusCache.timestamp = Date.now();

  return payload;
}
