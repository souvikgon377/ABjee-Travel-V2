import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const SOURCE_TIMEOUT_MS = 8000;

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

    const startedAt = Date.now();

    const firestoreStart = Date.now();
    let firestoreHealthy = false;
    let firestoreMs = 0;

    try {
      await withTimeout(adminDb.collection("users").limit(1).get(), "firestore");
      firestoreMs = Date.now() - firestoreStart;
      firestoreHealthy = true;
    } catch {
      firestoreMs = Date.now() - firestoreStart;
      firestoreHealthy = false;
    }

    const rtdbStart = Date.now();
    let rtdbHealthy = false;
    let rtdbMs = 0;

    try {
      await withTimeout(getAdminRtdb().ref("status").limitToFirst(1).get(), "rtdb");
      rtdbMs = Date.now() - rtdbStart;
      rtdbHealthy = true;
    } catch {
      rtdbMs = Date.now() - rtdbStart;
      rtdbHealthy = false;
    }

    const totalMs = Date.now() - startedAt;

    return ok({
      firebaseAuth: true,
      firestore: {
        ok: firestoreHealthy,
        ms: firestoreMs,
      },
      realtimeDb: {
        ok: rtdbHealthy,
        ms: rtdbMs,
      },
      responseTimeMs: totalMs,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get system status", 500);
  }
}
