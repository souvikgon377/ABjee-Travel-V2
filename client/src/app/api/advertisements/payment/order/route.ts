import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

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

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || '').trim().toLowerCase();

    if (!plan || !['monthly', 'quarterly', 'yearly'].includes(plan)) {
      return fail('Invalid plan selection', 400);
    }

    const promoCode = String(body.promoCode || '').trim().toUpperCase();

    const snapshot = await adminDb.collection('admin_settings').doc('system').get();
    const raw = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const pricing = raw.pricing && typeof raw.pricing === 'object' ? (raw.pricing as Record<string, unknown>) : {};

    const currency = typeof pricing.currency === 'string' && pricing.currency.trim() ? pricing.currency.trim().toUpperCase() : 'INR';
    const adMonthly = Number(pricing.adMonthly) || 100;
    const adQuarterly = Number(pricing.adQuarterly) || 250;
    const adYearly = Number(pricing.adYearly) || 800;

    let baseAmount = 0;
    if (plan === 'yearly') {
      baseAmount = adYearly;
    } else if (plan === 'quarterly') {
      baseAmount = adQuarterly;
    } else {
      baseAmount = adMonthly;
    }

    let discountPercent = 0;
    let discountAmount = 0;
    let finalAmount = baseAmount;

    if (promoCode) {
      const couponDoc = await adminDb.collection('coupons').doc(promoCode).get();
      let couponData = couponDoc.exists ? couponDoc.data() : null;

      if (!couponData) {
        const fallbackSnapshot = await adminDb
          .collection('coupons')
          .where('code', '==', promoCode)
          .limit(1)
          .get();

        if (!fallbackSnapshot.empty) {
          couponData = fallbackSnapshot.docs[0].data();
        }
      }

      if (!couponData || couponData.isActive === false) {
        return fail('Invalid or inactive coupon code', 400);
      }

      const now = Date.now();
      const validFrom = typeof couponData.validFrom === 'number' ? couponData.validFrom : null;
      const validUntil = typeof couponData.validUntil === 'number' ? couponData.validUntil : null;

      if (validFrom !== null && now < validFrom) {
        return fail('Coupon is not active yet', 400);
      }

      if (validUntil !== null && now > validUntil) {
        return fail('Coupon is expired', 400);
      }

      const appliesTo = couponData.appliesTo;
      if (appliesTo !== 'partners' && appliesTo !== plan) {
        return fail('Coupon is not valid for this plan', 400);
      }

      discountPercent = Math.max(0, Math.min(100, round2(Number(couponData.discountPercent || 0))));
      discountAmount = round2((baseAmount * discountPercent) / 100);
      finalAmount = Math.max(0, round2(baseAmount - discountAmount));
    }

    const amountInPaise = Math.round(finalAmount * 100);
    if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
      return fail('Invalid payment amount calculated', 400);
    }

    const { keyId, authHeader } = getRazorpayAuthHeader();

    const timestampPart = Date.now().toString(36);
    const planPart = plan.slice(0, 1);
    const userPart = user.id.slice(-12).replace(/[^a-zA-Z0-9]/g, '');
    const receipt = `ad_${timestampPart}_${planPart}_${userPart}`.slice(0, 40);

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        receipt,
        notes: {
          userId: user.id,
          type: 'advertisement',
          plan,
          amount: String(finalAmount),
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

    await adminDb.collection('advertisementPayments').doc(orderPayload.id).set({
      orderId: orderPayload.id,
      userId: user.id,
      plan,
      amount: finalAmount,
      baseAmount,
      discountPercent,
      discountAmount,
      promoCode: promoCode || null,
      currency,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      razorpayOrder: orderPayload,
    });

    return ok({
      orderId: orderPayload.id,
      amount: amountInPaise,
      currency,
      keyId,
      plan,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to initialize payment order', 500);
  }
}
