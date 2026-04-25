import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const SLOW_QUERY_MS = 200;

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const page = Number(searchParams.get("page") || "1");
    const requestedLimit = Number(searchParams.get("limit") || String(DEFAULT_LIMIT));
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : DEFAULT_LIMIT;
    const offset = (safePage - 1) * limit;
    const fetchWindow = Math.min(100, offset + limit + 1);
    const searchField = q.includes("@") ? "email_lower" : "displayName_lower";

    let queryRef: FirebaseFirestore.Query = adminDb
      .collection("users")
      .where("isActive", "==", true)
      .orderBy(searchField)
      .limit(fetchWindow);

    if (q && q.length >= 2) {
      queryRef = queryRef.startAt(q).endAt(`${q}\uf8ff`);
    }

    const startedAt = Date.now();
    const snapshot = await queryRef.get();
    const docs = snapshot.docs.filter((doc) => doc.id !== currentUser.id);
    const hasNext = docs.length > offset + limit;
    const rows = docs.slice(offset, offset + limit);

    const users = rows.map((doc) => {
      const user = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        _id: doc.id,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl,
        photoURL: user.photoURL,
        photoUrl: user.photoUrl,
        profileImage: user.profileImage,
        profilePicture: user.profilePicture,
        imageUrl: user.imageUrl,
        image: user.image,
        picture: user.picture,
        bio: user.bio,
        travelInterests: user.travelInterests,
        preferredDestinations: user.preferredDestinations,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
      };
    });

    const durationMs = Date.now() - startedAt;
    console.info("[UsersSearch] PREFIX_QUERY", {
      q,
      searchField,
      limit,
      page: safePage,
      docsRead: snapshot.size,
      rowsReturned: users.length,
      durationMs,
    });
    if (durationMs > SLOW_QUERY_MS) {
      console.warn("[UsersSearch] SLOW_QUERY", { route: "/api/users/search", durationMs, docsRead: snapshot.size });
    }

    return ok({
      users,
      pagination: {
        page,
        limit,
        total: offset + users.length + (hasNext ? 1 : 0),
        pages: hasNext ? safePage + 1 : safePage,
        hasNext,
        hasPrev: safePage > 1,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to search users", 500);
  }
}
