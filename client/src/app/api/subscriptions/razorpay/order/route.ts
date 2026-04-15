import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import {
  getConfiguredPlanByInterval,
  getConfiguredSubscriptionPlans,
  isValidInterval,
  isValidPaidPlan,
} from '@/lib/server/subscriptionPlans';
import { getCouponPricing } from '@/lib/server/couponPricing';

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

const buildReceipt = (userId: string, planType: string, interval: string) => {
  const safeUserPart = String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(-12);
  const timestampPart = Date.now().toString(36);
  const planPart = String(planType).slice(0, 1).toLowerCase() || 'p';
  const intervalPart = String(interval).slice(0, 1).toLowerCase() || 'm';
  const fallbackUserPart = Math.random().toString(36).slice(2, 8);
  const userPart = safeUserPart || fallbackUserPart;
  // Razorpay requires receipt length <= 40.
  return `sub_${timestampPart}_${planPart}${intervalPart}_${userPart}`.slice(0, 40);
};

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const planType = body.planType;
    const interval = body.interval;
    const promoCode = String(body.promoCode || '').trim();

    if (!isValidPaidPlan(planType)) {
      return fail('Invalid plan type', 400);
    }

    if (!isValidInterval(interval)) {
      return fail('Invalid billing interval', 400);
    }

    const [selectedPrice, configuredPlans] = await Promise.all([
      getConfiguredPlanByInterval(planType, interval),
      getConfiguredSubscriptionPlans(),
    ]);
    const couponPricing = await getCouponPricing({
      promoCode,
      planType,
      interval,
      baseAmount: selectedPrice.amount,
    });
    const amountInPaise = Math.round(couponPricing.finalAmount * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return fail('Invalid amount', 400);
    }

    const { keyId, authHeader } = getRazorpayAuthHeader();
    const receipt = buildReceipt(user.id, planType, interval);

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
          planName: configuredPlans[planType].name,
          promoCode: couponPricing.promoCode || '',
          discountPercent: String(couponPricing.discountPercent),
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
      amount: couponPricing.finalAmount,
      baseAmount: selectedPrice.amount,
      discountAmount: couponPricing.discountAmount,
      discountPercent: couponPricing.discountPercent,
      promoCode: couponPricing.promoCode,
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
      planName: configuredPlans[planType].name,
      baseAmount: selectedPrice.amount,
      finalAmount: couponPricing.finalAmount,
      discountAmount: couponPricing.discountAmount,
      discountPercent: couponPricing.discountPercent,
      promoCode: couponPricing.promoCode,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to initialize checkout', 500);
  }
}
