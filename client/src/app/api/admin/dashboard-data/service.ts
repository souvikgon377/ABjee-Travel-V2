import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok, withCacheHeaders } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { hybridGet } from '@/lib/server/hybridCache';
import { checkAdminRateLimit } from '@/lib/server/rateLimiter';
import { triggerBackgroundWarmup } from '@/lib/server/warmup';

export const runtime = 'nodejs';

const DASHBOARD_CACHE_KEY = 'admin:dashboard';
const DASHBOARD_CACHE_TTL_SECONDS = 180; // 3 minutes

export type DashboardData = {
  stats: {
    totalUsers: number;
    activeUsers: number;
    revenue: number;
    monthlyRevenue: number;
    pageViews: number;
    paidTransactions: number;
  };
  recentUsers: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    isActive: boolean;
    createdAt: unknown;
  }[];
  subscriptionsSummary: {
    total: number;
    basic: number;
    pro: number;
    premium: number;
    active: number;
  };
  cachedAt: number;
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    requireAdmin(user);

    // 1. Rate Limiting
    const limit = await checkAdminRateLimit(user.id);
    if (!limit.success) {
      return fail("Too many requests. Please wait.", 429);
    }

    // 2. Warmup (non-blocking)
    void triggerBackgroundWarmup();

    const forceRefresh = req.nextUrl.searchParams.get('forceRefresh') === 'true';

    const data = await hybridGet<DashboardData>(
      DASHBOARD_CACHE_KEY,
      fetchDashboardFromFirestore,
      { redisTtlSeconds: DASHBOARD_CACHE_TTL_SECONDS, forceRefresh }
    );

    const res = ok({ ...data, _cacheSource: forceRefresh ? 'fresh' : 'hybrid' });
    return withCacheHeaders(res, 60, 300);
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : 'Failed to load dashboard data';
    console.error('[Admin:Dashboard] Error:', message);
    return fail(message, 500);
  }
}

export async function fetchDashboardFromFirestore(): Promise<DashboardData> {
  console.info('[Admin:Dashboard] Fetching fresh from Firestore');
  
  const [statsSnap, usersSnap, subsSnap] = await Promise.allSettled([
    adminDb.collection('users').count().get(),
    adminDb.collection('users').orderBy('createdAt', 'desc').limit(20).get(),
    adminDb.collection('subscriptions').limit(200).get(),
  ]);

  // Build stats
  const totalUsers = statsSnap.status === 'fulfilled' && statsSnap.value
    ? ((statsSnap.value as any).data() as { count: number }).count
    : 0;

  // Build recent users
  const recentUsers = usersSnap.status === 'fulfilled' && usersSnap.value
    ? (usersSnap.value as any).docs.map((doc: any) => {
        const d = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          email: String(d.email ?? ''),
          displayName: String(d.displayName ?? ''),
          role: String(d.role ?? 'user'),
          isActive: d.isActive !== false,
          createdAt: (d.createdAt as { toDate?: () => Date })?.toDate?.() ?? d.createdAt ?? null,
        };
      })
    : [];

  // Build subscriptions summary
  const subDocs = subsSnap.status === 'fulfilled' && subsSnap.value ? subsSnap.value.docs : [];
  const now = new Date();
  const subscriptionsSummary = {
    total: subDocs.length,
    basic: subDocs.filter((d: any) => String((d.data() as Record<string, unknown>).type) === 'basic').length,
    pro: subDocs.filter((d: any) => String((d.data() as Record<string, unknown>).type) === 'pro').length,
    premium: subDocs.filter((d: any) => String((d.data() as Record<string, unknown>).type) === 'premium').length,
    active: subDocs.filter((d: any) => {
      const exp = (d.data() as Record<string, unknown>).expiresAt;
      if (!exp) return false;
      const expDate = (exp as { toDate?: () => Date })?.toDate?.() ?? new Date(exp as string);
      return expDate > now;
    }).length,
  };

  return {
    stats: {
      totalUsers,
      activeUsers: 0, // Placeholder if detailed stats not requested here
      revenue: 0,
      monthlyRevenue: 0,
      pageViews: 0,
      paidTransactions: 0,
    },
    recentUsers,
    subscriptionsSummary,
    cachedAt: Date.now(),
  };
}
