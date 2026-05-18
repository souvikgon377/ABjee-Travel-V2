import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getRedis } from '@/lib/server/redis';
import { authenticateRequest } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { reverseReviewRebate } from '@/lib/server/rebateWallet';

const getReviewsCacheKey = (placeId: string) => `reviews_${placeId}`;

export async function DELETE(req: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { reviewId } = await context.params;
    const placeId = (req.nextUrl.searchParams.get('placeId') || '').trim();

    if (!placeId) {
      return fail('placeId is required.', 400);
    }

    const reviewRef = adminDb
      .collection('touristPlaces')
      .doc(placeId)
      .collection('reviews')
      .doc(reviewId);

    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) {
      return fail('Review not found.', 404);
    }

    const review = reviewSnap.data() as { userId?: string };
    const currentUid = user.firebaseUid || user.id;
    const isAdmin = user.role === 'admin' || user.role === 'owner';

    if (!isAdmin && review.userId !== currentUid) {
      return fail('You can delete only your own review.', 403);
    }

    const reviewUserId = String(review.userId || currentUid);
    const reversal = await reverseReviewRebate({
      userId: reviewUserId,
      placeId,
      reviewId,
    });

    const redis = getRedis();
    if (redis) {
      await redis.del(getReviewsCacheKey(placeId));
    }

    return ok({ success: true, reversedPoints: reversal.reversedPoints, wallet: reversal.wallet });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete review.';
    return fail(message, 500);
  }
}
