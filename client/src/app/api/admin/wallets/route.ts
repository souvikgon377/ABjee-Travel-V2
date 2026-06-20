import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, requireAdmin } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { fetchUsersFromFirestore } from '@/app/api/admin/users/service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const users = await fetchUsersFromFirestore();

    // Map to minimal wallet info
    const rows = users.map((u) => ({
      id: u.id,
      email: (u.email as string) || null,
      displayName: (u.displayName as string) || null,
      wallet: (u.wallet as any) || null,
    }));

    return ok({ users: rows });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error('[Admin:Wallets] GET Error:', error);
    return fail('Failed to fetch wallets', 500);
  }
}
