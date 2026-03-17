import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

const allowedUpdates = [
  "firstName",
  "lastName",
  "bio",
  "travelInterests",
  "preferredDestinations",
  "address",
  "city",
  "zipCode",
  "avatar",
  "photoURL",
  "profileImage",
  "profilePicture",
];

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    return ok({ user });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get user profile", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    Object.keys(body || {}).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = body[key];
      }
    });

    const updated = await userService.update(user.id, updates);
    return ok({ user: updated, message: "Profile updated successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to update profile", 500);
  }
}
