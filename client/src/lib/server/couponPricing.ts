import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import type { PaidPlanType } from '@/lib/server/subscriptionPlans';

type Interval = 'monthly' | 'yearly';
type CouponAppliesTo = 'all' | PaidPlanType;

type CouponDoc = {
  code?: string;
  discountPercent?: number;
  isActive?: boolean;
  appliesTo?: CouponAppliesTo;
  validFrom?: number;
  validUntil?: number;
};

export type CouponPricingResult = {
  promoCode: string | null;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizePromoCode = (value: unknown) => String(value || '').trim().toUpperCase();

const coerceDiscountPercent = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, round2(parsed)));
};

const isCouponActiveNow = (coupon: CouponDoc) => {
  const now = Date.now();
  const validFrom = typeof coupon.validFrom === 'number' ? coupon.validFrom : null;
  const validUntil = typeof coupon.validUntil === 'number' ? coupon.validUntil : null;

  if (validFrom !== null && now < validFrom) {
    return false;
  }

  if (validUntil !== null && now > validUntil) {
    return false;
  }

  return true;
};

const getCouponDoc = async (promoCode: string): Promise<CouponDoc | null> => {
  const code = normalizePromoCode(promoCode);
  if (!code) return null;

  const directDoc = await adminDb.collection('coupons').doc(code).get();
  if (directDoc.exists) {
    return directDoc.data() as CouponDoc;
  }

  const fallbackSnapshot = await adminDb
    .collection('coupons')
    .where('code', '==', code)
    .limit(1)
    .get();

  if (fallbackSnapshot.empty) {
    return null;
  }

  return fallbackSnapshot.docs[0].data() as CouponDoc;
};

export async function getCouponPricing(params: {
  promoCode?: string;
  planType: PaidPlanType;
  interval: Interval;
  baseAmount: number;
}) {
  const normalizedCode = normalizePromoCode(params.promoCode);

  if (!normalizedCode) {
    return {
      promoCode: null,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: round2(params.baseAmount),
    } satisfies CouponPricingResult;
  }

  const coupon = await getCouponDoc(normalizedCode);

  if (!coupon || coupon.isActive === false) {
    throw new Error('Invalid or inactive coupon code');
  }

  if (!isCouponActiveNow(coupon)) {
    throw new Error('Coupon is expired or not active yet');
  }

  const appliesTo = coupon.appliesTo || 'all';
  if (appliesTo !== 'all' && appliesTo !== params.planType) {
    throw new Error('Coupon is not valid for this plan');
  }

  const discountPercent = coerceDiscountPercent(coupon.discountPercent);
  if (discountPercent <= 0) {
    throw new Error('Coupon discount is not configured correctly');
  }

  const discountAmount = round2((params.baseAmount * discountPercent) / 100);
  const finalAmount = Math.max(0, round2(params.baseAmount - discountAmount));

  return {
    promoCode: normalizedCode,
    discountPercent,
    discountAmount,
    finalAmount,
  } satisfies CouponPricingResult;
}
