import { NextRequest } from 'next/server';
import { FieldValue, adminDb } from '@/lib/server/firebaseAdminFirestore';
import { ok, fail } from '@/lib/server/http';
import { awardTripStoryRebate } from '@/lib/server/rebateWallet';

export const runtime = 'nodejs';

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const toMediaArray = (value: unknown) => (Array.isArray(value) ? value : []);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const authorName = String(body.authorName || '').trim();
    const destination = String(body.destination || '').trim();
    const title = String(body.title || '').trim();
    const description = String(body.description || '').trim();

    if (!authorName || !destination || !title || !description) {
      return fail('Please fill in all required fields.', 400);
    }

    const story = {
      authorName,
      authorEmail: String(body.authorEmail || '').trim(),
      authorId: String(body.authorId || '').trim(),
      destination,
      title,
      description,
      fullStory: String(body.fullStory || '').trim(),
      tripHighlights: String(body.tripHighlights || '').trim(),
      dayByDay: String(body.dayByDay || '').trim(),
      bestPlaces: String(body.bestPlaces || '').trim(),
      localFood: String(body.localFood || '').trim(),
      travelTips: String(body.travelTips || '').trim(),
      duration: String(body.duration || '').trim(),
      budget: String(body.budget || '').trim(),
      travelType: String(body.travelType || 'Solo').trim(),
      startDate: String(body.startDate || '').trim(),
      endDate: String(body.endDate || '').trim(),
      coverImage: String(body.coverImage || '').trim(),
      photos: toMediaArray(body.photos),
      videos: toMediaArray(body.videos),
      likes: toStringArray(body.likes),
      commentCount: Number.isFinite(Number(body.commentCount)) ? Number(body.commentCount) : 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection('stories').add(story);

    const authorId = String(body.authorId || '').trim();
    if (authorId) {
      try {
        await awardTripStoryRebate({ userId: authorId, storyId: docRef.id });
      } catch (walletErr) {
        console.error('[TripStoriesAPI] Failed to award wallet rebate:', walletErr);
      }
    }

    return ok({
      id: docRef.id,
      ...story,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 201);

  } catch (error) {
    console.error('[TripStoriesAPI] POST Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to submit story.';
    return fail(message, 500);
  }
}
