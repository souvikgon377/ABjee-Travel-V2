import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin, invalidateUserProfileCache } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";
import { subscriptionService } from "@/services/subscriptionService";
import { hybridUpdatePartial } from "@/lib/server/hybridCache";
import { checkAdminRateLimit } from "@/lib/server/rateLimiter";
import { SyncService } from "@/modules/search/SyncService";

export const runtime = "nodejs";

const USERS_CACHE_KEY = "admin:users";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { userId } = await params;
    const user = await userService.findById(userId);
    if (!user) return fail("User not found", 404);
    return ok({ user });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get user", 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    // 1. Rate Limiting
    const limitResult = await checkAdminRateLimit(currentUser.id);
    if (!limitResult.success) return fail("Too many requests. Please wait.", 429);

    const { userId } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (!["user", "moderator", "admin"].includes(body.role)) {
        return fail("Invalid role", 400);
      }
      updates.role = body.role;
    }

    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.subscription !== undefined) updates.subscription = body.subscription;
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.city !== undefined) updates.city = body.city;
    if (body.country !== undefined) updates.country = body.country;
    if (body.phoneNumber !== undefined) updates.phone = body.phoneNumber;

    if (body.email !== undefined) {
      const email = String(body.email).toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return fail("Invalid email format", 400);
      updates.email = email;
    }

    // 2. Perform database update
    const user = await userService.update(userId, updates);
    if (!user) return fail("User not found or update failed", 404);

    // Sync updated user to Typesense search index
    try {
      await SyncService.syncUser(user);
    } catch (syncErr) {
      console.warn(`[Admin:UpdateUser] Typesense sync failed for user ${userId}:`, syncErr);
    }
    
    // 3. Auto-invalidate auth cache for this user so changes reflect instantly
    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    // 4. Partial Cache Update for Admin List
    // Instead of invalidating the whole list (200 docs), we just update this one user in the cache.
    void hybridUpdatePartial<any[]>(USERS_CACHE_KEY, (current) => {
      if (!Array.isArray(current)) return current;
      return current.map(u => u.id === userId ? { ...u, ...updates } : u);
    });

    return ok({ message: "User updated successfully", user });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to update user", 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    // 1. Rate Limiting
    const limitResult = await checkAdminRateLimit(currentUser.id);
    if (!limitResult.success) return fail("Too many requests. Please wait.", 429);

    const { userId } = await params;
    if (userId === currentUser.id) {
      return fail("You cannot delete your own account", 400);
    }

    const userToDelete = await userService.findById(userId);
    if (!userToDelete) return fail("User not found", 404);

    // 2. Cancel user subscription immediately
    try {
      const subscription = await subscriptionService.findByUserId(userId);
      if (subscription) {
        await subscriptionService.cancel(subscription.id, "User deleted from admin user management", false);
      }
    } catch (subErr) {
      console.error(`[Admin:DeleteUser] Failed to cancel subscription for user ${userId}:`, subErr);
    }

    // 3. Clean up user from Realtime Database chatrooms
    try {
      const { getAdminRtdb } = await import("@/lib/server/firebaseAdminRtdb");
      const db = getAdminRtdb();
      const snapshot = await db.ref('chatrooms').once('value');
      const rooms = snapshot.val() || {};
      
      const updates: Record<string, any> = {};
      for (const roomId of Object.keys(rooms)) {
        const room = rooms[roomId];
        
        if (room.createdBy === userId) {
          updates[`chatrooms/${roomId}`] = null;
          continue;
        }
        
        let updated = false;
        const participants = Array.isArray(room.participants) ? room.participants : [];
        if (participants.includes(userId)) {
          updates[`chatrooms/${roomId}/participants`] = participants.filter((uid: string) => uid !== userId);
          updated = true;
        }
        
        const pendingInvites = Array.isArray(room.pendingInvites) ? room.pendingInvites : [];
        if (pendingInvites.includes(userId)) {
          updates[`chatrooms/${roomId}/pendingInvites`] = pendingInvites.filter((uid: string) => uid !== userId);
          updated = true;
        }
        
        const joinRequests = Array.isArray(room.joinRequests) ? room.joinRequests : [];
        if (joinRequests.includes(userId)) {
          updates[`chatrooms/${roomId}/joinRequests`] = joinRequests.filter((uid: string) => uid !== userId);
          updated = true;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    } catch (dbErr) {
      console.error(`[Admin:DeleteUser] Failed to clean up Realtime Database chatrooms for user ${userId}:`, dbErr);
    }

    // 4. Delete the user from Firestore
    await userService.delete(userId);

    // 5. Auto-invalidate auth cache for this user
    if (userToDelete?.firebaseUid) {
      await invalidateUserProfileCache(userToDelete.firebaseUid);
    }

    // 6. Partial Cache Update (Removal)
    void hybridUpdatePartial<any[]>(USERS_CACHE_KEY, (current) => {
      if (!Array.isArray(current)) return current;
      return current.filter(u => u.id !== userId);
    });

    return ok({ message: "User deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to delete user", 500);
  }
}
