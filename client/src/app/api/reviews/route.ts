import { NextRequest } from 'next/server';
import { safeRedisCall } from '@/lib/server/redis';
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
        } catch {
          // If parsing fails, treat it as a miss and continue to Firestore
        }
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

    // Server-side validation for media (counts, types, paid-only video)
    const SERVER_MAX_PHOTOS_PER_REVIEW = 2;
    const SERVER_MAX_VIDEOS_PER_REVIEW = 1;
    const SERVER_MAX_VIDEO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

    const rawMedia = Array.isArray(body.media) ? body.media : [];

    let photoCount = 0;
    let videoCount = 0;

    const validateMediaItem = (item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const url = typeof m.url === 'string' ? m.url : null;
      const publicId = typeof m.publicId === 'string' ? m.publicId : null;
      const type = m.type === 'video' ? 'video' : 'image';
      if (!url || !publicId) return null;
      return { url, publicId, type } as { url: string; publicId: string; type: 'image' | 'video' };
    };

    const media: { url: string; publicId: string; type: 'image' | 'video' }[] = [];

    for (const item of rawMedia) {
      const valid = validateMediaItem(item);
      if (!valid) continue;
      if (valid.type === 'video') videoCount += 1; else photoCount += 1;
      media.push(valid);
    }

    if (photoCount > SERVER_MAX_PHOTOS_PER_REVIEW) {
      return fail(`Maximum ${SERVER_MAX_PHOTOS_PER_REVIEW} photos allowed per review.`, 400);
    }

    if (videoCount > SERVER_MAX_VIDEOS_PER_REVIEW) {
      return fail(`Maximum ${SERVER_MAX_VIDEOS_PER_REVIEW} video allowed per review.`, 400);
    }

    // Determine if user has an active paid subscription
    const subscription = (user && typeof user.subscription === 'object') ? (user.subscription as Record<string, unknown>) : null;
    const isPaidSubscription = (sub: Record<string, unknown> | null | undefined) => {
      if (!sub || typeof sub !== 'object') return false;
      const type = typeof sub.type === 'string' ? sub.type.toLowerCase() : 'free';
      if (type === 'free') return false;
      const isActive = Boolean(sub.isActive);
      if (!isActive) return false;
      const endDate = sub.endDate ? new Date(sub.endDate as any) : null;
      if (endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) return false;
      return type === 'pro' || type === 'premium';
    };

    const userHasPaid = isPaidSubscription(subscription);

    if (videoCount > 0 && !userHasPaid) {
      return fail('Videos are available only for paid/premium users.', 403);
    }

    // Optional: try to check remote video size via HEAD request when possible
    for (const item of media) {
      if (item.type !== 'video') continue;
      try {
        const headRes = await fetch(item.url, { method: 'HEAD' });
        if (headRes.ok) {
          const len = headRes.headers.get('content-length');
          if (len) {
            const size = Number(len);
            if (Number.isFinite(size) && size > SERVER_MAX_VIDEO_SIZE_BYTES) {
              return fail(`Video exceeds maximum allowed size of 5MB.`, 400);
            }
          }
        }
      } catch (e) {
        // Ignore network failures here — size check is best-effort.
      }
    }

    const payload = {
      text: String(body.text || '').trim(),
      rating,
      media,
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
      ABJee: created.ABJee,
      wallet: created.wallet,
    });
  } catch (error) {
    await MetricsService.increment('admin_write_fail');
    const message = error instanceof Error ? error.message : 'Failed to create review.';
    return fail(message, 500);
  }
}
