import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { checkAdminRateLimit } from "@/lib/server/rateLimiter";
import { SearchService } from "@/modules/search/SearchService";
import { SyncService } from "@/modules/search/SyncService";
import { createDefaultWalletState } from "@/lib/server/rebateWallet";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const rateLimit = await checkAdminRateLimit(currentUser.id);
    if (!rateLimit.success) return fail("Too many requests. Please wait.", 429);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "20")));
    const search = (searchParams.get("search") || "").trim();
    const role = searchParams.get("role") || "all";
    const status = searchParams.get("status") || "all";

    const result = await SearchService.searchUsers({
      query: search,
      page,
      limit,
      role,
      status,
    });

    return ok({
      users: result.results,
      pagination: { 
        total: result.totalCount, 
        page, 
        limit, 
        pages: Math.ceil(result.totalCount / limit) 
      },
      metrics: { latencyMs: result.latencyMs, source: result.source }
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[Admin:Users] GET Error:", error);
    return fail("Failed to get users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json() as Record<string, unknown>;
    const { email, displayName, role = "user", city, phoneNumber, country } = body;

    if (!email || !displayName) return fail("Email and display name are required", 400);

    const existing = await userService.findByEmail(String(email));
    if (existing) return fail("User with this email already exists", 400);

    const ref = adminDb.collection("users").doc();
    const userData = {
      email: String(email).toLowerCase(),
      displayName: String(displayName),
      role: String(role),
      city: String(city || ""),
      country: String(country || ""),
      phone: String(phoneNumber || ""),
      isActive: true,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(String(displayName))}`,
      wallet: createDefaultWalletState(),
    };

    await ref.set(userData);

    // Sync with Typesense
    await SyncService.syncUser({
      id: ref.id,
      displayName: userData.displayName,
      email: userData.email,
      role: userData.role,
      status: userData.status,
      country: userData.country,
      updatedAt: userData.updatedAt,
    });
    await SearchService.invalidateSearchCache("user-created");

    return ok({ message: "User created successfully", user: { id: ref.id, ...userData } }, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[Admin:Users] POST Error:", error);
    return fail("Failed to create user", 500);
  }
}

export async function fetchUsersFromFirestore(): Promise<Record<string, unknown>[]> {
  const USERS_FETCH_LIMIT = 1000;
  console.info(`[Admin:Users] Fetching from Firestore (limit: ${USERS_FETCH_LIMIT})`);
  const snapshot = await adminDb
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(USERS_FETCH_LIMIT)
    .get();

  return snapshot.docs.map((doc: any) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      ...data,
      phoneNumber: (data.phone as string) || (data.phoneNumber as string) || null,
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? data.createdAt ?? null,
      lastSeen: (data.lastSeen as { toDate?: () => Date })?.toDate?.() ?? data.lastSeen ?? null,
    };
  });
}
