import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getRedis } from '@/lib/server/redis';
import { authenticateRequest } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';

const LOCK_TTL_SECONDS = 10;

const getReviewsCacheKey = (placeId: string) => `reviews_${placeId}`;
const getReviewsLockKey = (placeId: string) => `reviews_lock_${placeId}`;

const requireRedis = () => {
  const redis = getRedis();
  if (!redis) throw new Error('Redis is unavailable.');
  return redis;
};

const loadReviewsFromFirestore = async (placeId: string) => {
  const snapshot = await adminDb
    .collection('touristPlaces')
    .doc(placeId)
    .collection('reviews')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((reviewDoc: any) => ({
    id: reviewDoc.id,
    ...(reviewDoc.data() as Record<string, unknown>),
  }));
};

export async function GET(req: NextRequest) {
  try {
    const placeId = (req.nextUrl.searchParams.get('placeId') || '').trim();
    if (!placeId) {
      return fail('placeId is required.', 400);
    }

    const redis = requireRedis();
    const cacheKey = getReviewsCacheKey(placeId);
    const lockKey = getReviewsLockKey(placeId);

    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      console.info('[ReviewsCache] CACHE HIT', { placeId, key: cacheKey });
      const rows = JSON.parse(cached) as unknown[];
      return ok({ rows, cacheStatus: 'hit' });
    }

    console.info('[ReviewsCache] CACHE MISS', { placeId, key: cacheKey });
    const lockActive = await redis.get<string>(lockKey);
    if (lockActive) {
      console.info('[ReviewsCache] CACHE LOCK ACTIVE', { placeId, key: lockKey });
      return ok({ rows: [], cacheStatus: 'warming', message: 'Cache is warming. Retry shortly.' }, 202);
    }

    const lock = await redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL_SECONDS });
    if (lock !== 'OK') {
      console.info('[ReviewsCache] CACHE LOCK ACTIVE', { placeId, key: lockKey });
      return ok({ rows: [], cacheStatus: 'warming', message: 'Cache is warming. Retry shortly.' }, 202);
    }

    try {
      const rows = await loadReviewsFromFirestore(placeId);
      await redis.set(cacheKey, JSON.stringify(rows));
      return ok({ rows, cacheStatus: 'miss' });
    } finally {
      await redis.del(lockKey);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch reviews.';
    return fail(message, 503);
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const created = await adminDb
      .collection('touristPlaces')
      .doc(placeId)
      .collection('reviews')
      .add(payload);

    const redis = requireRedis();
    await redis.del(getReviewsCacheKey(placeId));

    return ok({ id: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create review.';
    return fail(message, 500);
  }
}
