import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { adminSearch } from '@/lib/server/touristSearchUtils';

export const runtime = 'nodejs';

const clampPage = (value: string | null) => {
  const parsed = Number(value || '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(50, Math.floor(parsed));
};

const clampLimit = (value: string | null) => {
  const parsed = Number(value || '30');
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(20, Math.min(50, Math.floor(parsed)));
};

const normalizeQueryParam = (value: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Proxy-safe client IP extraction
 */
function getClientIP(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    // @ts-ignore
    req.ip ||
    "unknown"
  );
}

/**
 * GET /api/admin/tourist-places/list
 * Admin-only protected tourist place search.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = normalizeQueryParam(searchParams.get('search'));
    const location = normalizeQueryParam(searchParams.get('location'));
    const filter = searchParams.get('filter') || 'all';
    const page = clampPage(searchParams.get('page'));
    const limit = clampLimit(searchParams.get('limit'));

    console.info('[AdminSearchRoute] API_CALL', {
      search,
      location,
      filter,
      page,
      limit,
    });

    // 1. Route-level guard (short-circuit trivial queries)
    if ((search.length > 0 && search.length < 2) || (location.length > 0 && location.length < 2)) {
      return ok({
        data: [],
        rows: [],
        total: 0,
        totalCount: 0,
        page,
        hasMore: false,
        source: 'short-circuit',
        cacheStatus: 'hit',
        queryName: 'short-circuit',
        docsReturned: 0,
      });
    }

    // 2. Perform search
    const results = await adminSearch({
      search,
      location,
      filter,
      page,
      limit,
      ip: getClientIP(req)
    });

    console.info('[AdminSearchRoute] RESULT', {
      queryName: `redis-index:${results.source}`,
      cacheStatus: results.cacheStatus,
      docsReturned: results.data.length,
      latencyMs: results.latencyMs,
    });

    return ok({
      ...results,
      rows: results.data,
      totalCount: results.total,
      queryName: `redis-index:${results.source}`,
      docsReturned: results.data.length,
    });
  } catch (error: any) {
    if (error.message === "RATE_LIMIT_EXCEEDED") {
      return fail("Too many requests. Please wait 10 seconds.", 429);
    }
    console.error('[AdminSearchRoute] ERROR:', error);
    return fail(error.message || "Internal search error", 500);
  }
}
