import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { getTourPlaceSearchMigrationProgress } from '@/lib/server/tourPlaceSearchMigration';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const jobId = req.nextUrl.searchParams.get('jobId')?.trim();
    if (!jobId) {
      return fail('jobId is required', 400);
    }

    const progress = await getTourPlaceSearchMigrationProgress(jobId);
    if (!progress) {
      return fail('Migration job not found', 404);
    }

    return ok({ progress });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }

    return fail('Failed to fetch migration status', 500);
  }
}
