import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdminAuth";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { userService } from "@/services/userService";
import { hybridGet, hybridInvalidate } from "@/lib/server/hybridCache";

type ElevatedRole = "admin" | "owner";

type RoleCacheEntry = {
  role: ElevatedRole;
  expiresAt: number;
};

// ─── User Profile Cache ──────────────────────────────────────────────────────
// L1 : In-process Map (fastest, no network, resets on cold start)
// L2 : Redis via hybridGet  (shared across ALL Vercel instances, survives cold starts)
//
// Previously: memory-only → every cold Vercel instance re-read Firestore for
// the first request from each user.
// Now: Redis hit on cold start → zero Firestore reads for known users.
//
// Cache keys:
//   auth:user:{uid}  — full user document  (15 min Redis TTL)
//   auth:role:{uid}  — elevated role string (15 min Redis TTL)
type UserProfileCacheEntry = {
  user: Record<string, unknown>;
  expiresAt: number;
};

const AUTH_USER_REDIS_TTL = 15 * 60;       // 15 minutes in Redis
const AUTH_USER_MEMORY_TTL = 5 * 60;       // 5 minutes in memory (L1)
const USER_PROFILE_CACHE_TTL_MS = AUTH_USER_MEMORY_TTL * 1000;
const userProfileCache = new Map<string, UserProfileCacheEntry>();

const getCachedUserProfile = (uid: string): Record<string, unknown> | null => {
  const entry = userProfileCache.get(uid);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    userProfileCache.delete(uid);
    return null;
  }
  return entry.user;
};

const setCachedUserProfile = (uid: string, user: Record<string, unknown>): void => {
  userProfileCache.set(uid, {
    user,
    expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
  });
};

export const invalidateUserProfileCache = async (uid: string): Promise<void> => {
  userProfileCache.delete(uid);
  // Also clear from Redis so other instances don't serve stale data
  await hybridInvalidate(`auth:user:${uid}`);
  await hybridInvalidate(`auth:role:${uid}`);
};
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_CACHE_TTL_MS = 15 * 60 * 1000;
const DATASTORE_TIMEOUT_MS = 2200;

const roleCacheByUid = new Map<string, RoleCacheEntry>();
const roleCacheByEmail = new Map<string, RoleCacheEntry>();

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const isAdminDataStoreError = (error: any) => {
  const rawCode = error?.code;
  const code = String(rawCode || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    rawCode === 8 ||
    code.includes("firestore") ||
    code.includes("resource-exhausted") ||
    code.includes("quota") ||
    code.includes("timed out") ||
    code.includes("deadline") ||
    code.includes("permission") ||
    code.includes("unavailable") ||
    message.includes("firestore") ||
    message.includes("resource_exhausted") ||
    message.includes("resource-exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("quota") ||
    message.includes("timed out") ||
    message.includes("deadline") ||
    message.includes("database") ||
    message.includes("default credentials") ||
    message.includes("project id") ||
    message.includes("permission") ||
    message.includes("unavailable")
  );
};

const normalizeEmail = (email?: string | null) => (typeof email === "string" ? email.trim().toLowerCase() : "");

const splitEnvEmails = (value?: string) =>
  (value || "")
    .split(/[;,\s]+/)
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);

const FALLBACK_OWNER_EMAILS = new Set([
  ...splitEnvEmails(process.env.OWNER_EMAILS),
  ...splitEnvEmails(process.env.NEXT_PUBLIC_OWNER_EMAILS),
  ...splitEnvEmails(process.env.OWNER_EMAIL),
  ...splitEnvEmails(process.env.NEXT_PUBLIC_OWNER_EMAIL),
]);

const FALLBACK_ADMIN_EMAILS = new Set([
  ...splitEnvEmails(process.env.ADMIN_EMAILS),
  ...splitEnvEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS),
  ...splitEnvEmails(process.env.ADMIN_EMAIL),
  ...splitEnvEmails(process.env.NEXT_PUBLIC_ADMIN_EMAIL),
  ...FALLBACK_OWNER_EMAILS,
]);

const getFallbackRoleByEmail = (email?: string | null): ElevatedRole | null => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  if (FALLBACK_OWNER_EMAILS.has(normalizedEmail)) return "owner";
  if (FALLBACK_ADMIN_EMAILS.has(normalizedEmail)) return "admin";
  return null;
};

const setRoleCache = (uid: string | undefined, email: string | undefined, role: ElevatedRole) => {
  const expiresAt = Date.now() + ROLE_CACHE_TTL_MS;
  const entry = { role, expiresAt };

  if (uid) {
    roleCacheByUid.set(uid, entry);
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    roleCacheByEmail.set(normalizedEmail, entry);
  }
};

const getCachedRole = (uid?: string, email?: string): ElevatedRole | null => {
  const now = Date.now();
  if (uid) {
    const byUid = roleCacheByUid.get(uid);
    if (byUid) {
      if (byUid.expiresAt >= now) return byUid.role;
      roleCacheByUid.delete(uid);
    }
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const byEmail = roleCacheByEmail.get(normalizedEmail);
    if (byEmail) {
      if (byEmail.expiresAt >= now) return byEmail.role;
      roleCacheByEmail.delete(normalizedEmail);
    }
  }

  return null;
};

const withDataStoreTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Datastore query timed out: ${label}`)), DATASTORE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Access denied. No token provided.", 401);
  }
  return header.slice(7);
};

const getAdminRoleByEmail = async (email?: string | null) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const snapshot = await adminDb.collection("admins").where("email", "==", normalizedEmail).limit(1).get();
  if (snapshot.empty) return null;
  const role = snapshot.docs[0].data().role;
  return role === "owner" ? "owner" : "admin";
};

export const authenticateRequest = async (req: NextRequest) => {
  const token = getBearerToken(req);
  let decoded: Record<string, any>;

  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    const message = String(error?.message || "").toLowerCase();

    if (
      code.startsWith("auth/") ||
      message.includes("token") ||
      message.includes("decod")
    ) {
      throw new AuthError("Invalid or expired authentication token.", 401);
    }

    throw error;
  }

  const tokenRole: ElevatedRole | null = decoded.role === "admin" || decoded.role === "owner" ? decoded.role : null;
  const fallbackRole = getFallbackRoleByEmail(decoded.email);

  // ── L1: In-memory cache (fastest) ──────────────────────────────────────────
  const memHit = getCachedUserProfile(decoded.uid);
  if (memHit) {
    if (!memHit.isActive) throw new AuthError("Account is deactivated.", 401);
    return memHit;
  }

  // ── L2: Redis cache (cross-instance, survives cold starts) ─────────────────
  // On cold Vercel instance, the memory cache is empty but Redis has the user.
  // This avoids a Firestore read for every cold-start request from a known user.
  try {
    const redisUser = await hybridGet<Record<string, unknown> | null>(
      `auth:user:${decoded.uid}`,
      () => Promise.resolve(null), // fetcher returns null — we handle miss below
      { redisTtlSeconds: AUTH_USER_REDIS_TTL, memoryTtlSeconds: AUTH_USER_MEMORY_TTL },
    );
    if (redisUser) {
      // Backfill L1 memory cache
      setCachedUserProfile(decoded.uid, redisUser);
      if (!redisUser.isActive) throw new AuthError("Account is deactivated.", 401);
      return redisUser;
    }
  } catch (redisErr) {
    // Redis unavailable — fall through to Firestore
    console.warn('[Auth] Redis auth cache unavailable, falling back to Firestore');
  }
  // ───────────────────────────────────────────────────────────────────────────

  let user: Record<string, any> | null = null;

  try {
    user = await withDataStoreTimeout(userService.findByFirebaseUid(decoded.uid), "findByFirebaseUid");
    const elevatedRole =
      tokenRole ||
      getCachedRole(decoded.uid, decoded.email) ||
      (await withDataStoreTimeout(getAdminRoleByEmail(decoded.email), "getAdminRoleByEmail")) ||
      fallbackRole;

    if (elevatedRole) {
      setRoleCache(decoded.uid, decoded.email, elevatedRole);
    }

    if (user?.role === "admin" || user?.role === "owner") {
      setRoleCache(decoded.uid, decoded.email, user.role as ElevatedRole);
    }

    if (!user) {
      const displayName = decoded.name || "";
      const nameParts = displayName.split(" ");
      user = await withDataStoreTimeout(userService.createWithId(decoded.uid, {
        firebaseUid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
        displayName,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        username: decoded.email?.split("@")[0] || "",
        avatar: decoded.picture || "",
        photoURL: decoded.picture || "",
        profileImage: decoded.picture || "",
        profilePicture: decoded.picture || "",
        role: elevatedRole || "user",
      }), "createWithId");
    } else {
      const patch: Record<string, unknown> = {};

      if (decoded.picture && decoded.picture !== user.avatar) {
        patch.avatar = decoded.picture;
        patch.photoURL = decoded.picture;
        patch.profileImage = decoded.picture;
        patch.profilePicture = decoded.picture;
      }

      if (decoded.name && decoded.name !== user.displayName) {
        patch.displayName = decoded.name;
      }

      if (elevatedRole && user.role !== elevatedRole) {
        patch.role = elevatedRole;
      }

      if (Object.keys(patch).length > 0) {
        user = await withDataStoreTimeout(userService.update(user.id, patch as Record<string, any>), "userService.update");
        // Invalidate cache on update so next request gets fresh data
        invalidateUserProfileCache(decoded.uid);
      }
    }

    // Store in both L1 memory and L2 Redis for subsequent calls
    if (user) {
      setCachedUserProfile(decoded.uid, user as Record<string, unknown>);
      // Fire-and-forget Redis write — don’t block the response
      void hybridGet<Record<string, unknown>>(
        `auth:user:${decoded.uid}`,
        () => Promise.resolve(user as Record<string, unknown>),
        { redisTtlSeconds: AUTH_USER_REDIS_TTL, memoryTtlSeconds: AUTH_USER_MEMORY_TTL, forceRefresh: true },
      );
    }
  } catch (error: any) {
    if (!isAdminDataStoreError(error)) {
      throw error;
    }

    const displayName = decoded.name || "";
    const nameParts = displayName.split(" ");
    user = {
      id: decoded.uid,
      firebaseUid: decoded.uid,
      email: decoded.email || "",
      emailVerified: !!decoded.email_verified,
      displayName,
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      username: decoded.email?.split("@")[0] || "",
      avatar: decoded.picture || "",
      photoURL: decoded.picture || "",
      profileImage: decoded.picture || "",
      profilePicture: decoded.picture || "",
      role: tokenRole || getCachedRole(decoded.uid, decoded.email) || fallbackRole || "user",
      isActive: true,
      _degradedAuth: true,
    };
  }

  if (!user?.isActive) {
    throw new AuthError("Account is deactivated.", 401);
  }

  return user;
};

export const requireAdmin = (user: Record<string, any>) => {
  if (!["admin", "owner"].includes(user.role)) {
    throw new AuthError("Admin access required.", 403);
  }
};
