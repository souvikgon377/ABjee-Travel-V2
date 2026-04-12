import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { notificationService } from "@/services/notificationService";
import { getAdminRtdb } from '@/lib/server/firebaseAdminRtdb';

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const {
      roomId,
      roomName,
      memberIds,
      inviteToken: providedInviteToken,
      inviterName,
      inviterEmail,
    } = body || {};

    if (!roomId || !roomName || !Array.isArray(memberIds)) {
      return fail("Missing required fields: roomId, roomName, memberIds", 400);
    }

    let inviteToken: string | undefined =
      typeof providedInviteToken === 'string' && providedInviteToken.trim().length > 0
        ? providedInviteToken.trim()
        : undefined;

    if (!inviteToken) {
      try {
        const roomSnapshot = await Promise.race([
          getAdminRtdb().ref(`chatrooms/${roomId}`).get(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('RTDB lookup timed out')), 1500);
          }),
        ]);

        if (roomSnapshot.exists()) {
          const roomData = roomSnapshot.val() as { inviteToken?: string };
          if (typeof roomData?.inviteToken === 'string' && roomData.inviteToken.trim().length > 0) {
            inviteToken = roomData.inviteToken;
          }
        }
      } catch {
        // Continue sending notifications even if RTDB read fails.
      }
    }

    const notifications = await notificationService.sendRoomInvitations(
      user.firebaseUid || user.id,
      memberIds,
      roomId,
      roomName,
      inviteToken,
      typeof inviterName === 'string' ? inviterName : (user.displayName || user.username || user.email || 'Community admin'),
      typeof inviterEmail === 'string' ? inviterEmail : (user.email || '')
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
