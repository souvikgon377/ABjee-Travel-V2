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
    const invitations = await notificationService.getPendingInvitations(user.firebaseUid || user.id);
    return ok(invitations);
  } catch (error: any) {
    if (error instanceof AuthError) {
      if (error.status === 401) return ok([]);
      return fail(error.message, error.status);
    }

    if (isTransientDatastoreError(error)) {
      return ok([]);
    }

    return fail("Failed to fetch pending invitations", 500);
  }
}
