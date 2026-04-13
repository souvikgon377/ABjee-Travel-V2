import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { notificationService } from '@/services/notificationService';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { roomId } = await context.params;
    const deletedCount = await notificationService.clearRoomNotifications(user.firebaseUid || user.id, roomId);
    return ok({ deletedCount });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail('Failed to clear room notifications', 500);
  }
}