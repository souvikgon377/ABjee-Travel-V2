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
import { getWalletRedemptionPreview } from '@/lib/server/rebateWallet';

export const runtime = 'nodejs';

const round2 = (value: number) => Math.round(value * 100) / 100;

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
    const useRbPoints = body.useRbPoints === true;

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
    const { keyId, authHeader } = getRazorpayAuthHeader();
    const couponPricing = await getCouponPricing({
      promoCode,
      planType,
      interval,
      baseAmount: selectedPrice.amount,
    });

    const walletPreview = useRbPoints
      ? await getWalletRedemptionPreview({
          userId: String(user.firebaseUid || user.id),
          amount: couponPricing.finalAmount,
        })
      : null;
    const rbPointsRedeemed = walletPreview?.redeemableAmount || 0;
    const rbDiscountAmount = rbPointsRedeemed;
    const finalAmount = round2(Math.max(0, couponPricing.finalAmount - rbDiscountAmount));
    const amountInPaise = Math.round(finalAmount * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return ok({
        requiresPayment: false,
        amount: 0,
        currency: selectedPrice.currency,
        keyId,
        planType,
        interval,
        planName: configuredPlans[planType].name,
        baseAmount: selectedPrice.amount,
        finalAmount,
        discountAmount: round2(couponPricing.discountAmount + rbDiscountAmount),
        discountPercent: couponPricing.discountPercent,
        promoCode: couponPricing.promoCode,
        rbPointsRedeemed,
        rbDiscountAmount,
      });
    }

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
          rbPointsRedeemed: String(rbPointsRedeemed),
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
      walletUserId: String(user.firebaseUid || user.id),
      planType,
      interval,
      amount: finalAmount,
      baseAmount: selectedPrice.amount,
      discountAmount: round2(couponPricing.discountAmount + rbDiscountAmount),
      couponDiscountAmount: couponPricing.discountAmount,
      discountPercent: couponPricing.discountPercent,
      promoCode: couponPricing.promoCode,
      rbPointsRedeemed,
      rbDiscountAmount,
      rbRedemptionStatus: rbPointsRedeemed > 0 ? 'pending' : 'none',
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
      finalAmount,
      discountAmount: round2(couponPricing.discountAmount + rbDiscountAmount),
      couponDiscountAmount: couponPricing.discountAmount,
      discountPercent: couponPricing.discountPercent,
      promoCode: couponPricing.promoCode,
      rbPointsRedeemed,
      rbDiscountAmount,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to initialize checkout', 500);
  }
}
