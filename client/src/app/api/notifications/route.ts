import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { notificationService } from "@/services/notificationService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const limit = Number(new URL(req.url).searchParams.get("limit") || "50");
    const notifications = await notificationService.getUserNotifications(user.firebaseUid || user.id, limit);
    return ok(notifications);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to fetch notifications", 500);
  }
}
