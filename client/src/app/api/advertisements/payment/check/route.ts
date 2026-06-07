import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const snapshot = await adminDb
      .collection('advertisementPayments')
      .where('userId', '==', user.id)
      .where('status', '==', 'paid')
      .get();

    if (snapshot.empty) {
      return ok({ paidPlan: null, paymentId: null, verifiedAt: null, createdAt: null });
    }

    const docs = snapshot.docs.map(doc => doc.data());
    docs.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const data = docs[0];
    return ok({
      paidPlan: data.plan || null,
      paymentId: data.razorpayPaymentId || null,
      verifiedAt: data.verifiedAt || null,
      createdAt: data.createdAt || null,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to check payment status', 500);
  }
}
