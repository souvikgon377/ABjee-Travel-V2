import { NextRequest } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { travelPartnerRequestService } from "@/services/travelPartnerRequestService";
import { userService } from "@/services/userService";
import { adminDb, Timestamp } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

const COLLECTION = "travelPartnerRequests";
const MAX_LIMIT = 20;
const MAX_SCAN_ROUNDS = 5;
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

const cursorToTimestamp = (cursor: CursorToken) => Timestamp.fromMillis(cursor.createdAtMs);

const normalizeFilterText = (value: string | null) => (value || "").toLowerCase().trim();

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const destination = normalizeFilterText(searchParams.get("destination"));
    const country = normalizeFilterText(searchParams.get("country"));
    const city = normalizeFilterText(searchParams.get("city"));
    const travelStyle = searchParams.get("travelStyle") || "";
    const cursor = decodeCursor(searchParams.get("cursor"));
    const requestedLimit = Number(searchParams.get("limit") || "20");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : MAX_LIMIT;

    let queryRef: FirebaseFirestore.Query = adminDb
      .collection(COLLECTION)
      .where("status", "==", "active")
      .where("isPublic", "==", true)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");

    if (cursor) {
      queryRef = queryRef.startAfter(cursorToTimestamp(cursor), cursor.docId);
    }

    const now = Date.now();
    const startedAt = Date.now();
    const requests: any[] = [];
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let docsRead = 0;

    for (let round = 0; round < MAX_SCAN_ROUNDS && requests.length < limit + 1; round += 1) {
      const snapshot = await queryRef.limit(limit + 1).get();
      docsRead += snapshot.size;
      if (snapshot.empty) break;

      lastDoc = snapshot.docs[snapshot.docs.length - 1] || lastDoc;

      for (const doc of snapshot.docs) {
        const request = { id: doc.id, ...doc.data() } as any;
        if (request.requester === user.id) continue;
        const startTs = request.startDate ? new Date(request.startDate).getTime() : 0;
        const expiresTs = request.expiresAt ? new Date(request.expiresAt).getTime() : 0;
        if (startTs && startTs < now) continue;
        if (expiresTs && expiresTs < now) continue;

        if (destination) {
          const hay = `${request.destination?.country || ""} ${request.destination?.city || ""} ${request.destination?.region || ""}`.toLowerCase();
          if (!hay.includes(destination)) continue;
        }
        if (country && !(request.destination?.country || "").toLowerCase().includes(country)) continue;
        if (city && !(request.destination?.city || "").toLowerCase().includes(city)) continue;
        if (travelStyle && request.travelStyle !== travelStyle) continue;

        requests.push(request);
        if (requests.length >= limit + 1) break;
      }

      queryRef = queryRef.startAfter(lastDoc);
      if (snapshot.size < limit + 1) break;
    }

    const pageRows = requests.slice(0, limit);
    const hasNext = requests.length > limit;
    const lastVisible = hasNext ? pageRows[pageRows.length - 1] : null;
    const nextCursor = lastVisible
      ? encodeCursor({ createdAtMs: toMillis(lastVisible.createdAt), docId: lastVisible.id })
      : null;

    const enriched = await Promise.all(
      pageRows.map(async (request) => {
        let requester = null;
        if (request.requester) {
          const requestUser = await userService.findById(request.requester);
          if (requestUser) {
            requester = {
              id: requestUser.id,
              username: requestUser.username,
              firstName: requestUser.firstName,
              lastName: requestUser.lastName,
              avatar: requestUser.avatar,
              travelInterests: requestUser.travelInterests,
            };
          }
        }

        travelPartnerRequestService.incrementViews(request.id).catch(() => {});

        return {
          ...request,
          requester,
          hasResponded: (request.responses || []).some((response: any) => response.user === user.id),
        };
      })
    );

    const durationMs = Date.now() - startedAt;
    console.info("[TravelPartners] CURSOR_QUERY", {
      limit,
      docsRead,
      rowsReturned: enriched.length,
      hasNext,
      durationMs,
    });
    if (durationMs > SLOW_QUERY_MS) {
      console.warn("[TravelPartners] SLOW_QUERY", { route: "/api/travel-partners/requests", durationMs, docsRead });
    }

    return ok({
      requests: enriched,
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
    return fail("Failed to get travel partner requests", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();

    const activeRequestsSnapshot = await adminDb
      .collection(COLLECTION)
      .where("requester", "==", user.id)
      .where("status", "==", "active")
      .limit(user.subscription?.type === "premium" ? 1 : 6)
      .get();

    const maxRequests = user.subscription?.type === "premium" ? -1 : user.subscription?.type === "pro" ? 5 : 1;
    if (maxRequests !== -1 && activeRequestsSnapshot.size >= maxRequests) {
      return fail(`You have reached your limit of ${maxRequests} active travel partner request(s)`, 403, {
        upgradeRequired: true,
      });
    }

    const created = await travelPartnerRequestService.create({ ...body, requester: user.id });
    return ok({ request: created, message: "Travel partner request created successfully" }, 201);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to create travel partner request", 500);
  }
}
