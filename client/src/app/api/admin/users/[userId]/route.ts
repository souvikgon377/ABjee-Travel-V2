import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

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
    if (body.phoneNumber !== undefined) updates.phone = body.phoneNumber;

    if (body.email !== undefined) {
      const email = String(body.email).toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return fail("Invalid email format", 400);
      updates.email = email;
    }

    const user = await userService.update(userId, updates);
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

    const { userId } = await params;
    if (userId === currentUser.id) {
      return fail("You cannot delete your own account", 400);
    }

    await userService.delete(userId);
    return ok({ message: "User deleted successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to delete user", 500);
  }
}
