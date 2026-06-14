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

    // Sync to Typesense
    try {
      const { SyncService } = await import('@/modules/search/SyncService');
      await SyncService.syncTripStory({
        id: docRef.id,
        ...story,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (syncErr) {
      console.error('[TripStoriesAPI] Failed to sync story to Typesense:', syncErr);
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

export async function PUT(req: NextRequest) {
  try {
    const storyId = req.nextUrl.searchParams.get('id');
    if (!storyId) {
      return fail('Missing story ID.', 400);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const storyRef = adminDb.collection('stories').doc(storyId);
    
    const doc = await storyRef.get();
    if (!doc.exists) {
      return fail('Story not found.', 404);
    }

    const existingData = doc.data() || {};

    const authorName = String(body.authorName || existingData.authorName || '').trim();
    const destination = String(body.destination || existingData.destination || '').trim();
    const title = String(body.title || existingData.title || '').trim();
    const description = String(body.description || existingData.description || '').trim();

    if (!authorName || !destination || !title || !description) {
      return fail('Please fill in all required fields.', 400);
    }

    const updatePayload = {
      authorName,
      authorEmail: String(body.authorEmail !== undefined ? body.authorEmail : (existingData.authorEmail || '')).trim(),
      authorId: String(body.authorId !== undefined ? body.authorId : (existingData.authorId || '')).trim(),
      destination,
      title,
      description,
      fullStory: String(body.fullStory !== undefined ? body.fullStory : (existingData.fullStory || '')).trim(),
      tripHighlights: String(body.tripHighlights !== undefined ? body.tripHighlights : (existingData.tripHighlights || '')).trim(),
      dayByDay: String(body.dayByDay !== undefined ? body.dayByDay : (existingData.dayByDay || '')).trim(),
      bestPlaces: String(body.bestPlaces !== undefined ? body.bestPlaces : (existingData.bestPlaces || '')).trim(),
      localFood: String(body.localFood !== undefined ? body.localFood : (existingData.localFood || '')).trim(),
      travelTips: String(body.travelTips !== undefined ? body.travelTips : (existingData.travelTips || '')).trim(),
      duration: String(body.duration !== undefined ? body.duration : (existingData.duration || '')).trim(),
      budget: String(body.budget !== undefined ? body.budget : (existingData.budget || '')).trim(),
      travelType: String(body.travelType !== undefined ? body.travelType : (existingData.travelType || 'Solo')).trim(),
      startDate: String(body.startDate !== undefined ? body.startDate : (existingData.startDate || '')).trim(),
      endDate: String(body.endDate !== undefined ? body.endDate : (existingData.endDate || '')).trim(),
      coverImage: String(body.coverImage !== undefined ? body.coverImage : (existingData.coverImage || '')).trim(),
      photos: toMediaArray(body.photos !== undefined ? body.photos : existingData.photos),
      videos: toMediaArray(body.videos !== undefined ? body.videos : existingData.videos),
      likes: toStringArray(body.likes !== undefined ? body.likes : existingData.likes),
      commentCount: Number.isFinite(Number(body.commentCount)) ? Number(body.commentCount) : (existingData.commentCount || 0),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await storyRef.update(updatePayload);

    // Sync to Typesense
    try {
      const { SyncService } = await import('@/modules/search/SyncService');
      await SyncService.syncTripStory({
        id: storyId,
        ...existingData,
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      });
    } catch (syncErr) {
      console.error('[TripStoriesAPI] Failed to sync updated story to Typesense:', syncErr);
    }

    return ok({
      id: storyId,
      ...existingData,
      ...updatePayload,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[TripStoriesAPI] PUT Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update story.';
    return fail(message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const storyId = req.nextUrl.searchParams.get('id');
    if (!storyId) {
      return fail('Missing story ID.', 400);
    }

    const storyRef = adminDb.collection('stories').doc(storyId);
    const doc = await storyRef.get();
    if (!doc.exists) {
      return fail('Story not found.', 404);
    }

    await storyRef.delete();

    // Sync deletion to Typesense
    try {
      const { SyncService } = await import('@/modules/search/SyncService');
      await SyncService.delete('trip_stories', storyId);
    } catch (syncErr) {
      console.error('[TripStoriesAPI] Failed to delete story from Typesense:', syncErr);
    }

    return ok({ success: true, message: 'Story deleted successfully.' });
  } catch (error) {
    console.error('[TripStoriesAPI] DELETE Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete story.';
    return fail(message, 500);
  }
}
