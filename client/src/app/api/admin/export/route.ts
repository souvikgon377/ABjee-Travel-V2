import { NextRequest } from "next/server";
import { FieldPath } from "firebase-admin/firestore";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";

export const runtime = "nodejs";

const MAX_LIMIT = 250;

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function deriveStoryGeo(rawStory: any): { area: string; state: string; country: string } {
  const destination = String(rawStory?.destination || "").trim();
  const tokens = destination
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const area =
    String(rawStory?.area || rawStory?.region || rawStory?.city || "").trim() ||
    (tokens.length >= 3 ? tokens[0] : destination);

  const state =
    String(rawStory?.state || rawStory?.province || "").trim() ||
    (tokens.length >= 2 ? tokens[tokens.length - 2] : "");

  const country =
    String(rawStory?.country || "").trim() ||
    (tokens.length >= 1 ? tokens[tokens.length - 1] : "");

  return { area, state, country };
}

async function fetchCollectionPage(collectionName: string, cursor: string | null, limit: number) {
  let query = adminDb.collection(collectionName).orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) {
    query = query.startAfter(cursor);
  }
  const snap = await query.get();
  const hasMore = snap.size === limit;
  const nextCursor = hasMore ? snap.docs[snap.docs.length - 1].id : null;
  return { snap, hasMore, nextCursor };
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const params = req.nextUrl.searchParams;
    const section = String(params.get("section") || "");
    const cursor = params.get("cursor");
    const requestedLimit = Number(params.get("limit") || "200");
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : 200;

    const userIdFilter = String(params.get("userId") || "all");
    const areaFilter = normalizeText(params.get("area") || "all");
    const stateFilter = normalizeText(params.get("state") || "all");
    const countryFilter = normalizeText(params.get("country") || "all");
    const placeFilter = normalizeText(params.get("place") || "all");
    const feedbackType = String(params.get("type") || "all");

    switch (section) {
      case "users": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("users", cursor, limit);
        const rows = snap.docs.map((doc) => {
          const u = doc.data() as Record<string, any>;
          return {
            id: doc.id,
            displayName: u.displayName ?? "",
            email: u.email ?? "",
            role: u.role ?? "user",
            isActive: u.isActive !== false ? "active" : "inactive",
            city: u.city ?? "",
            phoneNumber: u.phoneNumber ?? "",
            createdAt: u.createdAt?.toDate?.()?.toISOString?.() ?? u.createdAt ?? "",
          };
        });
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "trip-stories": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("stories", cursor, limit);
        const rows = snap.docs
          .map((doc) => {
            const s = doc.data() as Record<string, any>;
            const geo = deriveStoryGeo(s);
            return {
              storyId: doc.id,
              title: s.title || "Untitled Story",
              destination: s.destination || "",
              area: geo.area,
              state: geo.state,
              country: geo.country,
              authorId: s.authorId || "",
              authorName: s.authorName || "",
              authorEmail: s.authorEmail || "",
              travelType: s.travelType || "—",
              duration: s.duration || "—",
              budget: s.budget || "—",
              likesCount: Array.isArray(s.likes) ? s.likes.length : 0,
              commentCount: Number(s.commentCount || 0),
              mediaCount: (Array.isArray(s.photos) ? s.photos.length : 0) + (Array.isArray(s.videos) ? s.videos.length : 0),
              createdAt: s.createdAt?.toDate?.()?.toISOString?.() || s.createdAt || "",
            };
          })
          .filter((row) => (userIdFilter === "all" ? true : String(row.authorId || "") === userIdFilter))
          .filter((row) => (areaFilter === "all" ? true : normalizeText(row.area) === areaFilter))
          .filter((row) => (stateFilter === "all" ? true : normalizeText(row.state) === stateFilter))
          .filter((row) => (countryFilter === "all" ? true : normalizeText(row.country) === countryFilter));
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "tourist-places": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("touristPlaces", cursor, limit);
        const rows = snap.docs
          .map((doc) => {
            const p = doc.data() as Record<string, any>;
            const area = String(p.area || p.region || p.city || "").trim();
            const state = String(p.state || p.province || "").trim();
            const country = String(p.country || "India").trim();
            return {
              placeId: doc.id,
              name: p.name || "Unnamed Place",
              area,
              state,
              country,
              category: p.category || "—",
              description: String(p.description || ""),
              googleMapsUrl: p.googleMapsUrl || "—",
              coverImage: p.coverImage || "—",
              mediaCount: Array.isArray(p.media) ? p.media.length : 0,
              createdAt: p.createdAt?.toDate?.()?.toISOString?.() || p.createdAt || "",
              updatedAt: p.updatedAt?.toDate?.()?.toISOString?.() || p.updatedAt || "",
            };
          })
          .filter((row) => (areaFilter === "all" ? true : normalizeText(row.area) === areaFilter))
          .filter((row) => (stateFilter === "all" ? true : normalizeText(row.state) === stateFilter))
          .filter((row) => (countryFilter === "all" ? true : normalizeText(row.country) === countryFilter));
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "travel-itineraries": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("travel-destinations", cursor, limit);
        const rows = snap.docs
          .map((doc) => {
            const t = doc.data() as Record<string, any>;
            return {
              itineraryId: doc.id,
              place: String(t.place || ""),
              country: String(t.country || ""),
              budget: t.budget || "—",
              itinerary: String(t.itinerary || ""),
              placesCount: Array.isArray(t.places) ? t.places.length : 0,
              restaurantsCount: Array.isArray(t.restaurants) ? t.restaurants.length : 0,
              hotelsCount: Array.isArray(t.hotels) ? t.hotels.length : 0,
              imageCount: Array.isArray(t.images) ? t.images.length : 0,
              videoCount: Array.isArray(t.videos) ? t.videos.length : 0,
              createdAt: t.createdAt?.toDate?.()?.toISOString?.() || t.createdAt || "",
              updatedAt: t.updatedAt?.toDate?.()?.toISOString?.() || t.updatedAt || "",
            };
          })
          .filter((row) => (placeFilter === "all" ? true : normalizeText(row.place) === placeFilter))
          .filter((row) => (countryFilter === "all" ? true : normalizeText(row.country) === countryFilter));
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "subscriptions": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("subscriptions", cursor, limit);
        const rows = snap.docs.map((doc) => {
          const s = doc.data() as Record<string, any>;
          const paymentMethod = (s.paymentMethod || {}) as Record<string, unknown>;
          return {
            id: doc.id,
            userId: s.user ?? s.userId ?? "",
            status: s.status ?? "",
            planType: s.plan?.type ?? s.type ?? "",
            amount: s.plan?.price?.amount ?? "",
            currency: s.plan?.price?.currency ?? "INR",
            paymentType: paymentMethod.type ?? "unknown",
            razorpayOrderId: paymentMethod.orderId ?? "",
            razorpayPaymentId: paymentMethod.paymentId ?? "",
            startDate: s.startDate?.toDate?.()?.toISOString?.() ?? s.startDate ?? "",
            endDate: s.endDate?.toDate?.()?.toISOString?.() ?? s.endDate ?? "",
          };
        });
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "razorpay-payments": {
        const { snap, hasMore, nextCursor } = await fetchCollectionPage("subscriptionPayments", cursor, limit);
        const rows = snap.docs.map((doc) => {
          const p = doc.data() as Record<string, any>;
          const amount = typeof p.amountInPaise === "number"
            ? p.amountInPaise / 100
            : (typeof p.amount === "number" ? p.amount : 0);
          return {
            id: doc.id,
            orderId: p.orderId ?? doc.id,
            paymentId: p.razorpayPaymentId ?? "",
            userId: p.userId ?? "",
            planType: p.planType ?? "",
            interval: p.interval ?? "",
            status: p.status ?? "",
            amount,
            currency: p.currency ?? "INR",
            createdAt: p.createdAt ?? "",
            verifiedAt: p.verifiedAt ?? "",
            updatedAt: p.updatedAt ?? "",
          };
        });
        return ok({ rows, nextCursor, hasMore, capped: true });
      }

      case "reviews-comments": {
        // Bounded summary view to avoid subcollection fan-out.
        const [reviewsSnap, commentsSnap] = await Promise.all([
          adminDb.collectionGroup("reviews").limit(Math.min(limit, 200)).get(),
          adminDb.collectionGroup("mediaComments").limit(Math.min(limit, 200)).get(),
        ]);

        const rows = [
          ...reviewsSnap.docs.map((doc) => {
            const r = doc.data() as Record<string, any>;
            const placeId = doc.ref.parent.parent?.id || "";
            return {
              feedbackId: doc.id,
              type: "review",
              placeId,
              placeName: "",
              userId: String(r.userId || ""),
              author: String(r.author || ""),
              rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : "—",
              text: String(r.text || ""),
              mediaCount: Array.isArray(r.media) ? r.media.length : 0,
              createdAt: r.createdAt?.toDate?.()?.toISOString?.() || r.createdAt || "",
              _ts: toMillis(r.createdAt),
            };
          }),
          ...commentsSnap.docs.map((doc) => {
            const c = doc.data() as Record<string, any>;
            const placeId = doc.ref.parent.parent?.id || "";
            return {
              feedbackId: doc.id,
              type: "comment",
              placeId,
              placeName: "",
              userId: String(c.userId || ""),
              author: String(c.author || ""),
              rating: "—",
              text: String(c.text || ""),
              mediaCount: 0,
              mediaKey: c.mediaKey || "",
              createdAt: c.createdAt?.toDate?.()?.toISOString?.() || c.createdAt || "",
              _ts: toMillis(c.createdAt),
            };
          }),
        ]
          .filter((row) => (feedbackType === "all" ? true : row.type === feedbackType))
          .filter((row) => (userIdFilter === "all" ? true : String(row.userId || "") === userIdFilter))
          .sort((a, b) => b._ts - a._ts)
          .slice(0, limit)
          .map(({ _ts, ...rest }) => rest);

        return ok({ rows, nextCursor: null, hasMore: false, capped: true });
      }

      case "chatrooms": {
        const roomsSnap = await getAdminRtdb().ref("chatrooms").limitToFirst(limit).get();
        const data = (roomsSnap.val() || {}) as Record<string, any>;
        const rows = Object.entries(data).map(([id, r]) => ({
          id,
          name: r.name ?? "",
          isPrivate: r.isPrivate ? "private" : "public",
          memberCount: r.memberCount ?? 0,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        }));
        return ok({ rows, nextCursor: null, hasMore: false, capped: true });
      }

      case "pageviews": {
        const snap = await getAdminRtdb().ref("analytics/pageViews").get();
        return ok({
          rows: [{ metric: "pageViews", value: snap.val() ?? 0, exportedAt: new Date().toISOString() }],
          nextCursor: null,
          hasMore: false,
          capped: true,
        });
      }

      case "activity": {
        const [usersSnap, statusSnap] = await Promise.all([
          adminDb.collection("users").limit(limit).get(),
          getAdminRtdb().ref("status").limitToFirst(limit).get(),
        ]);

        const rows: Record<string, unknown>[] = [];

        usersSnap.docs.forEach((doc) => {
          const u = doc.data() as Record<string, any>;
          const ts = toMillis(u.createdAt);
          if (!ts) return;
          rows.push({
            activityType: "registration",
            source: "users",
            action: "User registered",
            details: `Account created with role: ${u.role || "user"}`,
            userId: doc.id,
            userName: u.displayName || u.username || "—",
            email: u.email || "—",
            role: u.role || "user",
            roomName: "—",
            occurredAt: new Date(ts).toLocaleString(),
          });
        });

        const statusData = (statusSnap.val() || {}) as Record<string, any>;
        Object.entries(statusData).forEach(([uid, s]) => {
          const ts = toMillis(s?.lastSeen);
          if (!ts) return;
          rows.push({
            activityType: "presence",
            source: "status",
            action: s?.isOnline ? "User is online" : "User was active",
            details: s?.isOnline ? "Online session detected" : "Last-seen state",
            userId: uid,
            userName: s?.username || "—",
            email: "—",
            role: "user",
            roomName: "—",
            occurredAt: new Date(ts).toLocaleString(),
          });
        });

        const filtered = userIdFilter && userIdFilter !== "all"
          ? rows.filter((row) => String(row.userId || "") === userIdFilter)
          : rows;

        return ok({ rows: filtered.slice(0, limit), nextCursor: null, hasMore: false, capped: true });
      }

      default:
        return fail("Unsupported export section", 400);
    }
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to export data", 500);
  }
}
