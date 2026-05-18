import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { userId } = req.nextUrl.pathname.match(/\/api\/admin\/wallets\/(.*)/)?.slice(1) ?? [] as string[];
    const body = await req.json() as Record<string, unknown>;
    if (!userId) return fail('userId required', 400);

    const action = String(body.action || '');

    const userRef = adminDb.collection('users').doc(userId);

    if (action === 'resetMonthly') {
      // Reset monthly redeemed and monthlyCapRupees if provided
      await userRef.set({
        wallet: {
          monthly: {
            redeemedPoints: 0,
            redeemedRupees: 0,
          },
        },
      }, { merge: true });

      return ok({ message: 'Monthly wallet reset' });
    }

    if (action === 'setAvailable') {
      const available = Math.max(0, Number(body.availablePoints || 0));
      await userRef.set({ wallet: { availablePoints: available } }, { merge: true });
      return ok({ message: 'Available points updated' });
    }

    return fail('Unknown action', 400);
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error('[Admin:Wallets] POST Error:', error);
    return fail('Failed to update wallet', 500);
  }
}
