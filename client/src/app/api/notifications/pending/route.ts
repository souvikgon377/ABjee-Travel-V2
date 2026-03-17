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
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to fetch pending invitations", 500);
  }
}
