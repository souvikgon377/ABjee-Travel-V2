import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, invalidateUserProfileCache, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { createDefaultWalletState, normalizeWalletState } from '@/lib/server/rebateWallet';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const userId = decodeURIComponent(req.nextUrl.pathname.split('/').pop() || '').trim();
    const body = await req.json() as Record<string, unknown>;
    if (!userId) return fail('userId required', 400);

    const action = String(body.action || '');

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return fail('User not found', 404);
    const userData = userSnap.data() || {};
    const currentWallet = normalizeWalletState((userData as any).wallet || createDefaultWalletState());

    if (action === 'resetMonthly') {
      // Reset monthly redeemed and monthlyCapRupees if provided
      await userRef.set({
        wallet: {
          ...currentWallet,
          monthly: {
            ...currentWallet.monthly,
            redeemedPoints: 0,
            redeemedRupees: 0,
          },
        },
      }, { merge: true });

      const firebaseUid = typeof (userData as any).firebaseUid === 'string' ? (userData as any).firebaseUid : userId;
      await invalidateUserProfileCache(firebaseUid);
      return ok({ message: 'Monthly wallet reset' });
    }

    if (action === 'setAvailable') {
      const available = Math.max(0, Number(body.availablePoints || 0));
      await userRef.set({
        wallet: {
          ...currentWallet,
          availablePoints: available,
          lifetimeEarnedPoints: Math.max(currentWallet.lifetimeEarnedPoints, available),
        },
      }, { merge: true });
      const firebaseUid = typeof (userData as any).firebaseUid === 'string' ? (userData as any).firebaseUid : userId;
      await invalidateUserProfileCache(firebaseUid);
      return ok({ message: 'Available points updated' });
    }

    return fail('Unknown action', 400);
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error('[Admin:Wallets] POST Error:', error);
    return fail('Failed to update wallet', 500);
  }
}
