import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdmin';
import {
  getPlanByInterval,
  isValidInterval,
  isValidPaidPlan,
  SUBSCRIPTION_PLANS,
} from '@/lib/server/subscriptionPlans';

export const runtime = 'nodejs';

const getRazorpayAuthHeader = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are missing');
  }

  return {
    keyId,
    authHeader: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
  };
};

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const planType = body.planType;
    const interval = body.interval;

    if (!isValidPaidPlan(planType)) {
      return fail('Invalid plan type', 400);
    }

    if (!isValidInterval(interval)) {
      return fail('Invalid billing interval', 400);
    }

    const selectedPrice = getPlanByInterval(planType, interval);
    const amountInPaise = Math.round(selectedPrice.amount * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return fail('Invalid amount', 400);
    }

    const { keyId, authHeader } = getRazorpayAuthHeader();
    const receipt = `sub_${user.id}_${planType}_${interval}_${Date.now()}`;

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: selectedPrice.currency,
        receipt,
        notes: {
          userId: user.id,
          planType,
          interval,
          planName: SUBSCRIPTION_PLANS[planType].name,
        },
      }),
    });

    const orderPayload = await razorpayRes.json().catch(() => ({}));

    if (!razorpayRes.ok || !orderPayload?.id) {
      const message = typeof orderPayload?.error?.description === 'string'
        ? orderPayload.error.description
        : 'Failed to create Razorpay order';
      return fail(message, 400);
    }

    await adminDb.collection('subscriptionPayments').doc(orderPayload.id).set({
      orderId: orderPayload.id,
      userId: user.id,
      planType,
      interval,
      amount: selectedPrice.amount,
      amountInPaise,
      currency: selectedPrice.currency,
      status: 'created',
      razorpayOrder: orderPayload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return ok({
      orderId: orderPayload.id,
      amount: amountInPaise,
      currency: selectedPrice.currency,
      keyId,
      planType,
      interval,
      planName: SUBSCRIPTION_PLANS[planType].name,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to initialize checkout', 500);
  }
}
