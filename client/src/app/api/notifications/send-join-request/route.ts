import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { getAdminRtdb } from "@/lib/server/firebaseAdminRtdb";
import { notificationService } from "@/services/notificationService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
    const requesterName = typeof body?.requesterName === "string" ? body.requesterName.trim() : "";
    const requesterEmail = typeof body?.requesterEmail === "string" ? body.requesterEmail.trim() : "";

    if (!roomId) {
      return fail("Missing required field: roomId", 400);
    }

    const roomSnapshot = await getAdminRtdb().ref(`chatrooms/${roomId}`).get();
    if (!roomSnapshot.exists()) {
      return fail("Community not found", 404);
    }

    const room = roomSnapshot.val() as {
      name?: string;
      createdBy?: string;
      isPublic?: boolean;
      visibility?: string;
    };

    const roomName = typeof room?.name === "string" ? room.name : "Private community";
    const creatorId = typeof room?.createdBy === "string" ? room.createdBy : "";
    const requesterId = user.firebaseUid || user.id;
    const roomVisibility = typeof room?.visibility === "string" ? room.visibility : "private";

    if (!creatorId) {
      return fail("Community creator not found", 400);
    }

    if (creatorId === requesterId) {
      return ok({ skipped: true, reason: "creator-request" });
    }

    if (room?.isPublic || room?.visibility !== "exposed") {
      return fail("Join request notifications are only for exposed private communities", 400);
    }

    const notification = await notificationService.createPrivateJoinRequestNotification({
      fromUserId: requesterId,
      toUserId: creatorId,
      roomId,
      roomName,
      requesterName: requesterName || user.displayName || user.username || user.email || "A user",
      requesterEmail: requesterEmail || user.email || "",
      roomVisibility,
    });

    return ok({ notification }, 200);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = typeof error?.message === "string" && error.message.trim().length > 0
      ? error.message
      : "Failed to send join request notification";
    return fail(message, 500);
  }
}
