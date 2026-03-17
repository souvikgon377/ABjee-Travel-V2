import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { notificationService } from "@/services/notificationService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const { roomId, roomName, memberIds } = body || {};

    if (!roomId || !roomName || !Array.isArray(memberIds)) {
      return fail("Missing required fields: roomId, roomName, memberIds", 400);
    }

    const notifications = await notificationService.sendRoomInvitations(
      user.firebaseUid || user.id,
      memberIds,
      roomId,
      roomName
    );

    return ok(
      {
        message: `Invitations sent to ${notifications.length} members`,
        notifications,
      },
      200
    );
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to send invitations", 500);
  }
}
