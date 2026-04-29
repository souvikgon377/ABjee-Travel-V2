import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { hybridGet, hybridInvalidate } from "@/lib/server/hybridCache";
import { checkAdminRateLimit } from "@/lib/server/rateLimiter";
import { triggerBackgroundWarmup } from "@/lib/server/warmup";

export const runtime = "nodejs";

const USERS_CACHE_KEY = "admin:users";
const USERS_REDIS_TTL = 180;  // 3 minutes
const USERS_MEMORY_TTL = 60;  // 1 minute
const USERS_FETCH_LIMIT = 200;

const normalizeSearchField = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    // 1. Rate Limiting
    const rateLimit = await checkAdminRateLimit(currentUser.id);
    if (!rateLimit.success) {
      return fail("Too many requests. Please wait.", 429);
    }

    // 2. Warmup (non-blocking)
    void triggerBackgroundWarmup();

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "20")));
    const search = (searchParams.get("search") || "").toLowerCase().trim();
    const role = searchParams.get("role") || "all";
    const status = searchParams.get("status") || "all";
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    // hybridGet: L1 memory → L2 Redis → Firestore (with in-flight dedup)
    const allUsers = await hybridGet<Record<string, unknown>[]>(
      USERS_CACHE_KEY,
      fetchUsersFromFirestore,
      { redisTtlSeconds: USERS_REDIS_TTL, memoryTtlSeconds: USERS_MEMORY_TTL, forceRefresh },
    );

    // In-memory filtering — zero additional Firestore reads
    let filtered = allUsers;

    if (role !== "all") {
      filtered = filtered.filter((u) => u.role === role);
    }

    if (status === "active") {
      filtered = filtered.filter((u) => u.isActive !== false);
    } else if (status === "inactive") {
      filtered = filtered.filter((u) => u.isActive === false);
    }

    if (search) {
      filtered = filtered.filter((u) => {
        const hay = `${u.email || ""} ${u.displayName || ""} ${u.username || ""}`.toLowerCase();
        return hay.includes(search);
      });
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return ok({
      users: paginated,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      _meta: { cacheSize: allUsers.length, filtered: total },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json() as Record<string, unknown>;
    const { email, displayName, role = "user", city, phoneNumber } = body;

    if (!email || !displayName) {
      return fail("Email and display name are required", 400);
    }

    if (!["user", "moderator", "admin"].includes(String(role))) {
      return fail("Invalid role", 400);
    }

    const existing = await userService.findByEmail(String(email));
    if (existing) {
      return fail("User with this email already exists", 400);
    }

    const ref = adminDb.collection("users").doc();
    const userData = {
      email: String(email).toLowerCase(),
      displayName: String(displayName),
      role: String(role),
      city: String(city || ""),
      phone: String(phoneNumber || ""),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(String(displayName))}`,
    };
    const searchFields = {
      displayName_lower: normalizeSearchField(userData.displayName),
      username_lower: "",
      email_lower: normalizeSearchField(userData.email),
    };

    await ref.set({
      ...userData,
      ...searchFields,
    });

    // Invalidate cache so next GET sees the new user (both L1 and L2)
    await hybridInvalidate(USERS_CACHE_KEY);

    return ok(
      { message: "User created successfully", user: { id: ref.id, ...userData, ...searchFields, phoneNumber: userData.phone } },
      201,
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to create user", 500);
  }
}

export async function fetchUsersFromFirestore(): Promise<Record<string, unknown>[]> {
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
      phoneNumber: (data.phone as string) || (data.phoneNumber as string) || "",
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? data.createdAt ?? null,
      lastSeen: (data.lastSeen as { toDate?: () => Date })?.toDate?.() ?? data.lastSeen ?? null,
    };
  });
}
