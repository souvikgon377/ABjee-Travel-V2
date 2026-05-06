import { NextRequest } from 'next/server';
import { getRedis, safeRedisCall } from '@/lib/server/redis';
import { authenticateRequest } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { FirestoreService } from '@/modules/database/FirestoreService';
import { RateLimitService } from '@/modules/auth/RateLimitService';
import { MetricsService } from '@/modules/analytics/MetricsService';
import { awardReviewRebate } from '@/lib/server/rebateWallet';

const getReviewsCacheKey = (placeId: string) => `reviews_${placeId}`;

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rate = await RateLimitService.check(ip, 60, 60); 
    if (!rate.allowed) return fail('Rate limit exceeded', 429);

    const placeId = (req.nextUrl.searchParams.get('placeId') || '').trim();
    const lastId = req.nextUrl.searchParams.get('lastId') || undefined;
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 10, 50);

    if (!placeId) {
      return fail('placeId is required.', 400);
    }

    // Attempt to get from cache if no pagination is used (L1 cache)
    if (!lastId) {
      const cached = await safeRedisCall(
        (redis) => redis.get(getReviewsCacheKey(placeId)),
        null,
        'getReviews'
      );
      if (cached) {
        try {
          const rows = typeof cached === 'string' ? JSON.parse(cached) : cached;
          await MetricsService.increment('redis_hit_count');
          return ok({ rows, cacheStatus: 'hit', hasMore: rows.length >= limit });
        } catch (e) {}
      }
      await MetricsService.increment('redis_miss_count');
    }

    const result = await FirestoreService.queryPaginated(
      `touristPlaces/${placeId}/reviews`,
      { limit, lastDocId: lastId, orderByField: 'createdAt', orderDirection: 'desc' }
    );

    await MetricsService.increment('firestore_reads_count', result.data.length);

    // Cache the first page only
    if (!lastId) {
      await safeRedisCall(
        (redis) => redis.set(getReviewsCacheKey(placeId), JSON.stringify(result.data), { ex: 300 }),
        null,
        'setReviews'
      );
    }

    return ok({ 
      rows: result.data, 
      hasMore: result.hasMore, 
      lastId: result.lastId,
      cacheStatus: 'miss' 
    });
  } catch (error) {
    console.error('[ReviewsAPI] GET Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch reviews.';
    return fail(message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rate = await RateLimitService.check(ip, 5, 60); // 5 reviews per min
    if (!rate.allowed) return fail('Too many reviews. Please wait.', 429);

    const user = await authenticateRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      placeId?: string;
      text?: string;
      rating?: number;
      media?: unknown[];
    };

    const placeId = String(body.placeId || '').trim();
    if (!placeId) {
      return fail('placeId is required.', 400);
    }

    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return fail('rating must be between 1 and 5.', 400);
    }

    const payload = {
      text: String(body.text || '').trim(),
      rating,
      media: Array.isArray(body.media) ? body.media : [],
      author: user.displayName || user.email || 'Traveller',
      userId: user.firebaseUid || user.id,
      createdAt: new Date(),
    };

    const created = await awardReviewRebate({
      userId: String(user.firebaseUid || user.id),
      placeId,
      reviewData: payload,
    });

    await safeRedisCall(
      (redis) => redis.del(getReviewsCacheKey(placeId)),
      null,
      'delReviewsCache'
    );

    await MetricsService.increment('admin_write_success');

    return ok({
      id: created.reviewId,
      rebate: created.rebate,
      wallet: created.wallet,
    });
  } catch (error) {
    await MetricsService.increment('admin_write_fail');
    const message = error instanceof Error ? error.message : 'Failed to create review.';
    return fail(message, 500);
  }
}
