import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { fail, ok } from '@/lib/server/http';
import { notificationService } from '@/services/notificationService';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ notificationId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { notificationId } = await context.params;
    const doc = await adminDb.collection('notifications').doc(notificationId).get();

    if (!doc.exists) {
      return fail('Invitation not found', 404);
    }

    const data = doc.data() as { toUserId?: string } | undefined;
    const currentUserId = user.firebaseUid || user.id;

    if (data?.toUserId && data.toUserId !== currentUserId) {
      return fail('Not authorized to update this invitation', 403);
    }

    const invitation = await notificationService.acceptInvitation(notificationId);
    return ok({ invitation });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail('Failed to accept invitation', 500);
  }
}