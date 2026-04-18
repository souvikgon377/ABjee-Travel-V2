import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { notificationService } from "@/services/notificationService";

export const runtime = "nodejs";

const isTransientDatastoreError = (error: unknown) => {
  const rawCode = (error as { code?: unknown })?.code;
  const code = String(rawCode ?? "").toLowerCase();
  const message = String((error as { message?: unknown })?.message ?? "").toLowerCase();

  return (
    rawCode === 8 ||
    code.includes("firestore") ||
    code.includes("database") ||
    code.includes("resource-exhausted") ||
    code.includes("quota") ||
    code.includes("deadline") ||
    code.includes("unavailable") ||
    message.includes("firestore") ||
    message.includes("database") ||
    message.includes("resource_exhausted") ||
    message.includes("resource-exhausted") ||
    message.includes("quota") ||
    message.includes("deadline") ||
    message.includes("unavailable") ||
    message.includes("default credentials") ||
    message.includes("project id")
  );
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const limit = Number(new URL(req.url).searchParams.get("limit") || "50");
    const notifications = await notificationService.getUserNotifications(user.firebaseUid || user.id, limit);
    return ok(notifications);
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.status === 401) return ok([]);
      return fail(error.message, error.status);
    }

    if (isTransientDatastoreError(error)) {
      return ok([]);
    }

    return fail("Failed to fetch notifications", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const deletedCount = await notificationService.clearUserNotifications(user.firebaseUid || user.id);
    return ok({ deletedCount });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to clear notifications", 500);
  }
}
