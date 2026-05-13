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
    const messageId = typeof body?.messageId === "string" ? body.messageId.trim() : "";
    const messagePreview = typeof body?.messagePreview === "string" ? body.messagePreview : "";

    if (!roomId || !messageId) {
      return fail("Missing required fields: roomId, messageId", 400);
    }

    const senderId = user.firebaseUid || user.id;
    const roomRef = getAdminRtdb().ref(`chatrooms/${roomId}`);
    const roomSnapshot = await roomRef.get();

    if (!roomSnapshot) {
      return fail("Community not found", 404);
    }

    const roomExists = typeof roomSnapshot.exists === 'function' ? roomSnapshot.exists() : roomSnapshot.exists;
    if (!roomExists) {
      return fail("Community not found", 404);
    }

    const room = roomSnapshot.val() as {
      isPublic?: boolean;
      name?: string;
      participants?: string[];
      createdBy?: string;
    };

    if (room?.isPublic) {
      return ok({ skipped: true, reason: "public-room" });
    }

    const roomName = typeof room?.name === "string" && room.name.trim().length > 0
      ? room.name.trim()
      : "Private community";

    const participants = Array.isArray(room?.participants) ? room.participants : [];
    const allowedSender = participants.includes(senderId) || room?.createdBy === senderId;
    if (!allowedSender) {
      return fail("Not authorized to notify for this community", 403);
    }

    const messageRef = getAdminRtdb().ref(`chatrooms/${roomId}/messages/${messageId}`);
    const messageSnapshot = await messageRef.get();
    
    if (!messageSnapshot) {
      return fail("Message not found", 404);
    }

    const messageExists = typeof messageSnapshot.exists === 'function' ? messageSnapshot.exists() : messageSnapshot.exists;
    if (!messageExists) {
      return fail("Message not found", 404);
    }

    const message = messageSnapshot.val() as { userId?: string };
    if (message?.userId !== senderId) {
      return fail("Not authorized to notify for this message", 403);
    }

    const recipientIds = Array.from(new Set([...(participants || []), room?.createdBy || ""]))
      .filter((id) => Boolean(id) && id !== senderId);

    if (recipientIds.length === 0) {
      return ok({ skipped: true, reason: "no-recipients" });
    }

    const result = await notificationService.upsertPrivateRoomMessageNotifications({
      fromUserId: senderId,
      fromUserName: user.displayName || user.username || user.email || "A member",
      fromUserEmail: user.email || "",
      recipientIds,
      roomId,
      roomName,
      messagePreview,
    });

    return ok(result, 200);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to send room message notifications", 500);
  }
}