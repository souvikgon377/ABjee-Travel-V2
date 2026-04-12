import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';
import { notificationService } from '@/services/notificationService';
import { getAdminRtdb } from '@/lib/server/firebaseAdminRtdb';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ notificationId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { notificationId } = await context.params;
    const doc = await adminDb.collection('notifications').doc(notificationId).get();

    if (!doc.exists) {
      return fail('Invitation not found', 404);
    }

    const data = doc.data() as {
      toUserId?: string;
      type?: string;
      roomId?: string;
      fromUserId?: string;
    } | undefined;
    const currentUserId = user.firebaseUid || user.id;

    if (data?.toUserId && data.toUserId !== currentUserId) {
      return fail('Not authorized to update this invitation', 403);
    }

    if (data?.type === 'private_room_join_request') {
      const roomId = typeof data.roomId === 'string' ? data.roomId : '';
      const requestUserId = typeof data.fromUserId === 'string' ? data.fromUserId : '';

      if (!roomId || !requestUserId) {
        return fail('Join request notification is missing room or requester details', 400);
      }

      const roomRef = getAdminRtdb().ref(`chatrooms/${roomId}`);
      const roomSnapshot = await roomRef.get();

      if (!roomSnapshot.exists()) {
        return fail('Community not found', 404);
      }

      const room = roomSnapshot.val() as {
        createdBy?: string;
        joinRequests?: string[];
      };

      if (room?.createdBy !== currentUserId) {
        return fail('Only the community creator can reject join requests', 403);
      }

      const joinRequests = Array.isArray(room?.joinRequests) ? room.joinRequests : [];
      const updatedJoinRequests = joinRequests.filter((uid) => uid !== requestUserId);

      await roomRef.update({ joinRequests: updatedJoinRequests });
    }

    const invitation = await notificationService.rejectInvitation(notificationId);
    return ok({ invitation });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail('Failed to reject invitation', 500);
  }
}