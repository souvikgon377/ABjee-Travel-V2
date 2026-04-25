import { NextRequest } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb, Timestamp } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

const MAX_LIMIT = 20;
const SLOW_QUERY_MS = 200;

type CursorToken = {
  createdAtMs: number;
  docId: string;
};

const encodeCursor = (token: CursorToken | null) => {
  if (!token) return null;
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
};

const decodeCursor = (value: string | null): CursorToken | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as CursorToken;
    if (!parsed || typeof parsed.createdAtMs !== "number" || typeof parsed.docId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

const toMillis = (value: any) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000);
  return 0;
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const cursor = decodeCursor(searchParams.get("cursor"));
    const requestedLimit = Number(searchParams.get("limit") || "20");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : MAX_LIMIT;

    let queryRef: FirebaseFirestore.Query = adminDb
      .collection("travelPartnerRequests")
      .where("requester", "==", user.id);

    if (status) {
      queryRef = queryRef.where("status", "==", status);
    }

    queryRef = queryRef
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");

    if (cursor) {
      queryRef = queryRef.startAfter(Timestamp.fromMillis(cursor.createdAtMs), cursor.docId);
    }

    const startedAt = Date.now();
    const snapshot = await queryRef.limit(limit + 1).get();
    const requests: any[] = snapshot.docs.slice(0, limit).map((doc) => ({ id: doc.id, ...doc.data() }));
    const hasNext = snapshot.size > limit;
    const lastVisible = hasNext ? requests[requests.length - 1] : null;
    const nextCursor = lastVisible
      ? encodeCursor({ createdAtMs: toMillis(lastVisible.createdAt), docId: lastVisible.id })
      : null;

    const durationMs = Date.now() - startedAt;
    console.info("[TravelPartners:Mine] CURSOR_QUERY", {
      limit,
      docsRead: snapshot.size,
      rowsReturned: requests.length,
      hasNext,
      durationMs,
    });
    if (durationMs > SLOW_QUERY_MS) {
      console.warn("[TravelPartners:Mine] SLOW_QUERY", { route: "/api/travel-partners/my-requests", durationMs, docsRead: snapshot.size });
    }

    return ok({
      requests,
      pagination: {
        limit,
        hasNext,
        hasPrev: Boolean(cursor),
        nextCursor,
      },
      nextCursor,
      hasMore: hasNext,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get your travel partner requests", 500);
  }
}

