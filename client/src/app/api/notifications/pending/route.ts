import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { notificationService } from "@/services/notificationService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const invitations = await notificationService.getPendingInvitations(user.firebaseUid || user.id);
    return ok(invitations);
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.status === 401) return ok([]);
      return fail(error.message, error.status);
    }

    const message = String(error?.message || "").toLowerCase();
    if (
      message.includes("firestore") ||
      message.includes("database") ||
      message.includes("default credentials") ||
      message.includes("project id") ||
      message.includes("unavailable")
    ) {
      return ok([]);
    }

    return fail("Failed to fetch pending invitations", 500);
  }
}
