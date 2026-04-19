import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { startTourPlaceSearchMigration } from '@/lib/server/tourPlaceSearchMigration';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const started = await startTourPlaceSearchMigration();
    return ok({
      jobId: started.jobId,
      alreadyRunning: started.alreadyRunning,
      progress: started.progress,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    return fail('Failed to start migration', 500);
  }
}
