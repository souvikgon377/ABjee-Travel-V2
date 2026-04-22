import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getAdminRtdb } from '@/lib/server/firebaseAdminRtdb';

// Simple in-memory cache for analytics data to reduce database reads
const analyticsCache: {
  pageViews: Record<string, any>;
  cachedAt: number;
} = {
  pageViews: { total: 0, lastUpdated: 0 },
  cachedAt: 0,
};

const CACHE_TTL_MS = 5000; // 5 second cache

const isAbortLikeError = (error: unknown) => {
  if (!error) return false;

  const err = error as { name?: string; code?: string; message?: string };
  const name = String(err.name || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();
  const message = String(err.message || '').toLowerCase();

  return (
    name === 'aborterror'
    || code === 'aborted'
    || code === 'econnreset'
    || message.includes('aborted')
    || message.includes('econnreset')
    || message.includes('socket hang up')
  );
};

export async function POST(req: NextRequest) {
  try {
    // Authenticate user (optional for analytics)
    let userId: string | null = null;
    try {
      const user = await authenticateRequest(req);
      userId = user.uid;
    } catch {
      // Continue without auth for anonymous analytics
    }

    const body = await req.json();
    const { eventType, pagePath: _pagePath, userEmail } = body;

    if (!eventType) {
      return fail('eventType is required', 400);
    }

    const timestamp = Date.now();
    const rtdb = getAdminRtdb();

    if (eventType === 'pageView') {
      // Track page view in analytics with caching to reduce database reads
      const now = Date.now();
      const dateKey = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD

      // Use cache if fresh
      let currentData = analyticsCache.pageViews;
      if (now - analyticsCache.cachedAt > CACHE_TTL_MS) {
        const pageViewsRef = rtdb.ref('analytics/pageViews');
        const current = await pageViewsRef.get();
        currentData = current.val() || { total: 0 };
        analyticsCache.pageViews = currentData;
        analyticsCache.cachedAt = now;
      }

      // Update cache and database
      const newData = {
        total: (currentData.total || 0) + 1,
        [dateKey]: (currentData[dateKey] || 0) + 1,
        lastUpdated: timestamp,
      };

      // Update both cache and database
      analyticsCache.pageViews = newData;
      analyticsCache.cachedAt = now;

      // Fire async update without waiting
      getAdminRtdb()
        .ref('analytics/pageViews')
        .set(newData)
        .catch((err) => console.error('Error updating pageviews:', err));
    } else if (eventType === 'userSession') {
      // Track user session (fire and forget to respond quickly)
      if (userId) {
        // Update Realtime DB status
        const statusRef = rtdb.ref(`status/${userId}`);
        statusRef
          .set({
            userId,
            email: userEmail || '',
            online: true,
            isOnline: true,
            lastSeen: timestamp,
            sessionStart: timestamp,
          })
          .catch((err) => console.error('Error setting status:', err));

        // Also update Firestore asynchronously
        const userDocRef = adminDb.collection('users').doc(userId);
        userDocRef
          .get()
          .then((userSnap) => {
            if (!userSnap.data()) {
              return userDocRef.set({
                uid: userId,
                email: userEmail || '',
                lastSeen: new Date(timestamp),
                createdAt: new Date(timestamp),
                updatedAt: new Date(timestamp),
                isActive: true,
                sessionCount: 1,
              });
            } else {
              const data = userSnap.data() || {};
              return userDocRef.update({
                lastSeen: new Date(timestamp),
                updatedAt: new Date(timestamp),
                isActive: true,
                sessionCount: (data.sessionCount || 0) + 1,
              });
            }
          })
          .catch((err) => console.error('Error updating Firestore:', err));
      }
    } else if (eventType === 'userLogout') {
      // Track user logout (fire and forget)
      if (userId) {
        const statusRef = rtdb.ref(`status/${userId}`);
        statusRef
          .update({
            online: false,
            isOnline: false,
            lastSeen: timestamp,
            sessionEnd: timestamp,
          })
          .catch((err) => console.error('Error updating status:', err));

        const userDocRef = adminDb.collection('users').doc(userId);
        userDocRef
          .update({
            lastSeen: new Date(timestamp),
            isActive: false,
          })
          .catch((err) => console.error('Error updating Firestore:', err));
      }
    } else if (eventType === 'userActivity') {
      // Update user activity (fire and forget)
      if (userId) {
        const statusRef = rtdb.ref(`status/${userId}`);
        statusRef
          .update({
            lastSeen: timestamp,
            lastActivity: timestamp,
          })
          .catch((err) => console.error('Error updating activity:', err));

        const userDocRef = adminDb.collection('users').doc(userId);
        userDocRef
          .update({
            lastSeen: new Date(timestamp),
          })
          .catch((err) => console.error('Error updating Firestore:', err));
      }
    }

    return ok({
      success: true,
      eventType,
      timestamp,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      // Browser/navigation aborts are expected for fire-and-forget analytics.
      return ok({ success: false, ignored: true, reason: 'request_aborted' });
    }
    console.error('Analytics tracking error:', error);
    return fail('Failed to track event', 500);
  }
}
