import { auth } from './firebase';

// Request deduplication cache to prevent duplicate requests
const pendingRequests = new Map<string, Promise<Response>>();

// Debounce timers to batch activity updates
let activityDebounceTimer: NodeJS.Timeout | null = null;
let pageViewDebounceTimer: NodeJS.Timeout | null = null;
let lastActivityUserId: string | null = null;

/**
 * Internal fetch with request deduplication
 */
async function fetchDeduplicated(cacheKey: string, init: RequestInit, url: string): Promise<Response> {
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      return await fetch(url, init);
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Track a page view via API (debounced to batch requests)
 */
export async function trackPageView(pagePath: string) {
  try {
    // Skip tracking for API routes and health checks
    if (pagePath.startsWith('/api') || pagePath === '/health') {
      return;
    }

    // Debounce page view tracking - batch multiple navigations within 2 seconds
    if (pageViewDebounceTimer) {
      clearTimeout(pageViewDebounceTimer);
    }

    pageViewDebounceTimer = setTimeout(async () => {
      try {
        await fetchDeduplicated(
          `pageView:${pagePath}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              eventType: 'pageView',
              pagePath,
            }),
          },
          '/api/analytics/track-event'
        ).catch(() => null);
      } finally {
        pageViewDebounceTimer = null;
      }
    }, 2000); // Batch within 2 seconds
  } catch (error) {
    void error;
  }
}

/**
 * Track user session via API
 */
export async function trackUserSession(userId: string, userEmail?: string) {
  try {
    const token = await getAuthToken();
    if (!token) return; // Skip if no auth

    await fetchDeduplicated(
      `session:${userId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: 'userSession',
          userId,
          userEmail: userEmail || '',
        }),
      },
      '/api/analytics/track-event'
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error tracking user session:', error);
    }
  }
}

/**
 * Track user logout via API
 */
export async function trackUserLogout(userId: string) {
  try {
    const token = await getAuthToken();
    if (!token) return; // Skip if no auth

    await fetchDeduplicated(
      `logout:${userId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: 'userLogout',
          userId,
        }),
      },
      '/api/analytics/track-event'
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error tracking user logout:', error);
    }
  }
}

/**
 * Update user activity via API (debounced to reduce database writes)
 */
export async function updateUserActivity(userId: string) {
  try {
    // Only update if userId changed or debounce timer expired
    if (lastActivityUserId === userId && activityDebounceTimer) {
      return; // Already scheduled update for this user
    }

    lastActivityUserId = userId;

    if (activityDebounceTimer) {
      clearTimeout(activityDebounceTimer);
    }

    // Debounce activity updates - only send every 30 seconds
    activityDebounceTimer = setTimeout(async () => {
      try {
        await fetchDeduplicated(
          `activity:${userId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await getAuthToken()}`,
            },
            body: JSON.stringify({
              eventType: 'userActivity',
              userId,
            }),
          },
          '/api/analytics/track-event'
        ).catch(() => null);
      } finally {
        activityDebounceTimer = null;
        lastActivityUserId = null;
      }
    }, 30000); // Debounce for 30 seconds
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in updateUserActivity:', error);
    }
  }
}

/**
 * Get auth token for API calls
 */
async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      return await currentUser.getIdToken();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error getting auth token:', error);
      }
      return '';
    }
  }
  return '';
}
