import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || '').trim().toLowerCase();
    const promoCode = String(body.promoCode || '').trim().toUpperCase();

    if (!plan || !['monthly', 'quarterly', 'yearly'].includes(plan)) {
      return fail('Invalid plan selection', 400);
    }

    if (!promoCode) {
      return fail('Coupon code is required', 400);
    }

    // Get pricing from settings
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

    // Get coupon from db
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

    const discountPercent = Math.max(0, Math.min(100, round2(Number(couponData.discountPercent || 0))));
    if (discountPercent <= 0) {
      return fail('Coupon discount is not configured correctly', 400);
    }

    const discountAmount = round2((baseAmount * discountPercent) / 100);
    const finalAmount = Math.max(0, round2(baseAmount - discountAmount));

    return ok({
      promoCode,
      plan,
      baseAmount,
      currency,
      discountPercent,
      discountAmount,
      finalAmount,
    });
  } catch (error: any) {
    return fail(error?.message || 'Unable to validate coupon', 400);
  }
}
