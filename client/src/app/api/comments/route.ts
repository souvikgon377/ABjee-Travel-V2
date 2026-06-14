import { NextRequest } from 'next/server';
import { authenticateRequest, invalidateUserProfileCache } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { RateLimitService } from '@/modules/auth/RateLimitService';
import { MetricsService } from '@/modules/analytics/MetricsService';
import { awardCommentRebate, reverseCommentRebate } from '@/lib/server/rebateWallet';
import { FieldValue, adminDb } from '@/lib/server/firebaseAdminFirestore';
import { notificationService } from '@/services/notificationService';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rate = await RateLimitService.check(ip, 10, 60); // 10 comments per min
    if (!rate.allowed) return fail('Too many comments. Please wait.', 429);

    const user = await authenticateRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      targetId?: string;
      targetType?: 'story' | 'itinerary';
      text?: string;
      userName?: string;
    };

    const targetId = String(body.targetId || '').trim();
    const targetType = body.targetType;
    const text = String(body.text || '').trim();
    const userName = String(body.userName || user.displayName || user.email || 'Traveller').trim();

    if (!targetId) {
      return fail('targetId is required.', 400);
    }
    if (targetType !== 'story' && targetType !== 'itinerary') {
      return fail('targetType must be either "story" or "itinerary".', 400);
    }
    if (!text) {
      return fail('Comment text is required.', 400);
    }

    const currentUserId = String(user.id || user.firebaseUid || '').trim();
    const currentFirebaseUid = String(user.firebaseUid || user.id || '').trim();
    if (!currentUserId && !currentFirebaseUid) {
      return fail('Authenticated user profile is missing an id.', 401);
    }

    const collectionName = targetType === 'story' ? 'stories' : 'travel-destinations';
    const commentsRef = adminDb.collection(collectionName).doc(targetId).collection('comments');
    
    // Check if user has already commented on this story/itinerary
    const existingComments = await commentsRef.where('userId', '==', currentFirebaseUid || currentUserId).limit(1).get();
    if (!existingComments.empty) {
      return fail(`You have already submitted a comment for this ${targetType === 'story' ? 'story' : 'itinerary'}.`, 400);
    }

    let rebateResult = null;
    try {
      rebateResult = await awardCommentRebate({
        userId: currentUserId || currentFirebaseUid,
        targetId,
        targetType,
        commentText: text,
      });
    } catch (rebateError) {
      console.warn('[CommentsAPI] Rebate transaction failed; creating comment without wallet reward:', rebateError);
    }

    const payload = {
      userName,
      text,
      createdAt: FieldValue.serverTimestamp(),
      userId: currentFirebaseUid || currentUserId,
      userEmail: user.email || null,
      userAvatar: user.photoURL || user.avatar || user.profilePicture || null,
      pointsAwarded: rebateResult ? rebateResult.points : 0,
    };

    const commentDocRef = await commentsRef.add(payload);

    // Increment comment count on the parent document if it exists
    try {
      const parentRef = adminDb.collection(collectionName).doc(targetId);
      await adminDb.runTransaction(async (t) => {
        const parentSnap = await t.get(parentRef);
        if (parentSnap.exists) {
          const count = parentSnap.data()?.commentCount || 0;
          t.update(parentRef, { commentCount: count + 1 });
        }
      });
    } catch (err) {
      console.warn('[CommentsAPI] Failed to increment commentCount:', err);
    }

    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    await MetricsService.increment('admin_write_success');

    if (rebateResult && rebateResult.points > 0) {
      try {
        let targetName = targetType === 'story' ? 'story' : 'itinerary';
        if (targetType === 'story') {
          const docSnap = await adminDb.collection('stories').doc(targetId).get();
          if (docSnap.exists) {
            targetName = docSnap.data()?.title || 'story';
          }
        } else {
          const docSnap = await adminDb.collection('travel-destinations').doc(targetId).get();
          if (docSnap.exists) {
            targetName = docSnap.data()?.place || 'itinerary';
          }
        }

        await notificationService.create({
          toUserId: currentFirebaseUid || currentUserId,
          type: 'points_received',
          message: `You earned ${rebateResult.points} Abjee point${rebateResult.points === 1 ? '' : 's'} for commenting on "${targetName}".`,
          details: {
            action: 'points_received',
            points: rebateResult.points,
            targetId,
            targetType,
            targetName,
          },
        });
      } catch (notiError) {
        console.warn('[CommentsAPI] Failed to create notification for points received:', notiError);
      }
    }

    return ok({
      id: commentDocRef.id,
      comment: {
        id: commentDocRef.id,
        ...payload,
        createdAt: new Date(),
      },
      rebate: rebateResult || null,
    });
  } catch (error) {
    await MetricsService.increment('admin_write_fail');
    console.error('[CommentsAPI] POST Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create comment.';
    const status = (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number')
      ? (error as any).status
      : 500;
    return fail(message, status);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const commentId = req.nextUrl.searchParams.get('commentId') || '';
    const targetId = req.nextUrl.searchParams.get('targetId') || '';
    const targetType = req.nextUrl.searchParams.get('targetType') || '';

    if (!commentId || !targetId || !targetType) {
      return fail('commentId, targetId, and targetType are required.', 400);
    }
    if (targetType !== 'story' && targetType !== 'itinerary') {
      return fail('targetType must be either "story" or "itinerary".', 400);
    }

    const currentUserId = String(user.id || user.firebaseUid || '').trim();
    const currentFirebaseUid = String(user.firebaseUid || user.id || '').trim();
    if (!currentUserId && !currentFirebaseUid) {
      return fail('Authenticated user profile is missing an id.', 401);
    }

    const collectionName = targetType === 'story' ? 'stories' : 'travel-destinations';
    const commentRef = adminDb.collection(collectionName).doc(targetId).collection('comments').doc(commentId);
    
    const commentSnap = await commentRef.get();
    if (!commentSnap.exists) {
      return fail('Comment not found.', 404);
    }

    const commentData = commentSnap.data() || {};
    const commentOwnerId = String(commentData.userId || '').trim();

    if (commentOwnerId !== currentUserId && commentOwnerId !== currentFirebaseUid) {
      return fail('You do not have permission to delete this comment.', 403);
    }

    const pointsAwarded = Number(commentData.pointsAwarded || 0);

    let reversalResult = null;
    if (pointsAwarded > 0) {
      try {
        reversalResult = await reverseCommentRebate({
          userId: currentUserId || currentFirebaseUid,
          targetId,
          targetType,
          pointsToDeduct: pointsAwarded,
        });
      } catch (rebateError) {
        console.warn('[CommentsAPI] Reversal rebate transaction failed:', rebateError);
      }
    }

    await commentRef.delete();

    // Decrement comment count on the parent document if it exists
    try {
      const parentRef = adminDb.collection(collectionName).doc(targetId);
      await adminDb.runTransaction(async (t) => {
        const parentSnap = await t.get(parentRef);
        if (parentSnap.exists) {
          const count = parentSnap.data()?.commentCount || 0;
          t.update(parentRef, { commentCount: Math.max(0, count - 1) });
        }
      });
    } catch (err) {
      console.warn('[CommentsAPI] Failed to decrement commentCount:', err);
    }

    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    await MetricsService.increment('admin_write_success');

    return ok({
      success: true,
      reversal: reversalResult || null,
    });
  } catch (error) {
    await MetricsService.increment('admin_write_fail');
    console.error('[CommentsAPI] DELETE Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete comment.';
    return fail(message, 500);
  }
}
