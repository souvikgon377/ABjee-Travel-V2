import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/server/http';
import { getConfiguredPlanByInterval, isValidInterval, isValidPaidPlan } from '@/lib/server/subscriptionPlans';
import { getCouponPricing } from '@/lib/server/couponPricing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
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

    if (!promoCode) {
      return fail('Coupon code is required', 400);
    }

    const selectedPrice = await getConfiguredPlanByInterval(planType, interval);
    const pricing = await getCouponPricing({
      promoCode,
      planType,
      interval,
      baseAmount: selectedPrice.amount,
    });

    return ok({
      planType,
      interval,
      baseAmount: selectedPrice.amount,
      currency: selectedPrice.currency,
      ...pricing,
    });
  } catch (error: any) {
    return fail(error?.message || 'Unable to validate coupon', 400);
  }
}
