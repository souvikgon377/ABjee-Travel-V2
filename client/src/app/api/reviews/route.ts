import { NextRequest } from 'next/server';
import { safeRedisCall } from '@/lib/server/redis';
import { authenticateRequest, invalidateUserProfileCache } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { RateLimitService } from '@/modules/auth/RateLimitService';
import { MetricsService } from '@/modules/analytics/MetricsService';
import { awardReviewRebate } from '@/lib/server/rebateWallet';
import { FieldValue, adminDb } from '@/lib/server/firebaseAdminFirestore';

const getReviewsCacheKey = (placeId: string) => `reviews_${placeId}`;

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') {
      return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
};

const compareReviews = (left: any, right: any) => {
  const leftTime = toMillis(left.createdAt);
  const rightTime = toMillis(right.createdAt);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id || '').localeCompare(String(left.id || ''));
};

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

    const reviewsRef = adminDb.collection('touristPlaces').doc(placeId).collection('reviews');
    void safeRedisCall(
      (redis) => redis.del(getReviewsCacheKey(placeId)),
      null,
      'delStaleReviewsCache'
    );

    try {
      let query = reviewsRef.orderBy('createdAt', 'desc').limit(limit + 1);
      if (lastId) {
        const cursorDoc = await reviewsRef.doc(lastId).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const snap = await query.get();
      let rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      if (!lastId && rows.length < limit) {
        const fallbackSnap = await reviewsRef.limit(100).get();
        const byId = new Map<string, any>();
        for (const row of rows) byId.set(String(row.id), row);
        fallbackSnap.docs.forEach((doc) => byId.set(doc.id, { id: doc.id, ...doc.data() }));
        rows = Array.from(byId.values()).sort(compareReviews);
      }

      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      await MetricsService.increment('firestore_reads_count', snap.size);

      return ok({
        rows: pageRows,
        hasMore,
        lastId: pageRows.length > 0 ? pageRows[pageRows.length - 1].id : null,
        cacheStatus: 'disabled',
      });
    } catch (queryError) {
      console.warn('[ReviewsAPI] Ordered review query failed, using compatibility fallback:', queryError);
      const fallbackSnap = await reviewsRef.limit(Math.max(limit, 100)).get();
      const rows = fallbackSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort(compareReviews)
        .slice(0, limit);

      await MetricsService.increment('firestore_reads_count', fallbackSnap.size);
      return ok({
        rows,
        hasMore: fallbackSnap.size > limit,
        lastId: rows.length > 0 ? rows[rows.length - 1].id : null,
        cacheStatus: 'fallback',
      });
    }
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

    const parsedRating = Number(body.rating);
    const rating = Number.isFinite(parsedRating) && parsedRating >= 1 && parsedRating <= 5
      ? parsedRating
      : 5;

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
    for (const item of [] as typeof media) {
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
      } catch {
        // Ignore network failures here — size check is best-effort.
      }
    }

    const currentUserId = String(user.id || user.firebaseUid || '').trim();
    const currentFirebaseUid = String(user.firebaseUid || user.id || '').trim();
    if (!currentUserId && !currentFirebaseUid) {
      return fail('Authenticated user profile is missing an id.', 401);
    }

    const payload = {
      text: String(body.text || '').trim(),
      rating,
      media,
      author: user.displayName || user.email || 'Traveller',
      userId: currentFirebaseUid || currentUserId,
      walletUserId: currentUserId || currentFirebaseUid,
      createdAt: new Date(),
    };

    let created: {
      reviewId: string;
      ABJee: { textPoints: number; mediaPoints: number; totalPoints: number };
      wallet: unknown;
    };

    try {
      created = await awardReviewRebate({
        userId: currentUserId || currentFirebaseUid,
        placeId,
        reviewData: payload,
      });
    } catch (rebateError) {
      console.warn('[ReviewsAPI] Rebate transaction failed; creating review without wallet reward:', rebateError);
      const reviewRef = await adminDb
        .collection('touristPlaces')
        .doc(placeId)
        .collection('reviews')
        .add({
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
          ABJee: { textPoints: 0, mediaPoints: 0, totalPoints: 0 },
          walletReward: {
            points: 0,
            valueInRupees: 0,
            skippedReason: rebateError instanceof Error ? rebateError.message : String(rebateError),
            awardedAt: FieldValue.serverTimestamp(),
          },
        });
      created = {
        reviewId: reviewRef.id,
        ABJee: { textPoints: 0, mediaPoints: 0, totalPoints: 0 },
        wallet: null,
      };
    }

    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    await safeRedisCall(
      (redis) => redis.del(getReviewsCacheKey(placeId)),
      null,
      'delReviewsCache'
    );

    await MetricsService.increment('admin_write_success');

    return ok({
      id: created.reviewId,
      review: {
        id: created.reviewId,
        ...payload,
        walletUserId: currentUserId || currentFirebaseUid,
        ABJee: created.ABJee,
      },
      ABJee: created.ABJee,
      wallet: created.wallet,
    });
  } catch (error) {
    await MetricsService.increment('admin_write_fail');
    console.error('[ReviewsAPI] POST Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create review.';
    const status = (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number')
      ? (error as any).status
      : 500;
    return fail(message, status);
  }
}
