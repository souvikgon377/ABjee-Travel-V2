import { NextRequest } from 'next/server';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { RedisUnavailableError, refreshSharedPlacesCache } from '@/lib/server/sharedPlacesCache';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    const refreshed = await refreshSharedPlacesCache();

    return ok({
      message: 'Places cache updated.',
      cacheStatus: refreshed.cacheStatus,
      source: refreshed.source,
      count: refreshed.places.length,
    });
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      return fail(error.message, 503);
    }
    const message = error instanceof Error ? error.message : 'Failed to update places cache.';
    return fail(message, 500);
  }
}
