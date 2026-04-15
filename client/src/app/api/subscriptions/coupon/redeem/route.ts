import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { subscriptionService } from '@/services/subscriptionService';
import { userService } from '@/services/userService';
import {
  getConfiguredPlanByInterval,
  getConfiguredPrivateRoomLimits,
  getConfiguredSubscriptionPlans,
  getIntervalEndDate,
  isValidInterval,
  isValidPaidPlan,
} from '@/lib/server/subscriptionPlans';
import { getCouponPricing } from '@/lib/server/couponPricing';

export const runtime = 'nodejs';

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

    if (!promoCode) {
      return fail('Coupon code is required', 400);
    }

    const [selectedPrice, configuredPlans, privateRoomLimits] = await Promise.all([
      getConfiguredPlanByInterval(planType, interval),
      getConfiguredSubscriptionPlans(),
      getConfiguredPrivateRoomLimits(),
    ]);
    const couponPricing = await getCouponPricing({
      promoCode,
      planType,
      interval,
      baseAmount: selectedPrice.amount,
    });

    if (couponPricing.finalAmount > 0) {
      return fail('Coupon does not fully cover the payable amount', 400);
    }

    const selectedPlan = configuredPlans[planType];
    const startDate = new Date();
    const endDate = getIntervalEndDate(interval, startDate);

    let subscription = await subscriptionService.findByUserId(user.id);

    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: selectedPrice,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = privateRoomLimits[planType];

    const billingEntry = {
      amount: 0,
      currency: selectedPrice.currency,
      status: 'paid',
      description: `${selectedPlan.name} - ${interval} subscription (100% coupon)` ,
      invoiceId: `INV-COUPON-${Date.now()}`,
      paymentDate: new Date().toISOString(),
      paymentGateway: 'coupon',
      promoCode: couponPricing.promoCode,
      discountPercent: couponPricing.discountPercent,
      discountAmount: couponPricing.discountAmount,
      baseAmount: selectedPrice.amount,
    };

    if (!subscription) {
      subscription = await subscriptionService.create({
        user: user.id,
        plan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        paymentMethod: {
          type: 'coupon',
          promoCode: couponPricing.promoCode,
        },
        promoCode: couponPricing.promoCode,
        billingHistory: [billingEntry],
      });
    } else {
      subscription = await subscriptionService.update(subscription.id, {
        plan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        autoRenew: true,
        cancellation: null,
        paymentMethod: {
          type: 'coupon',
          promoCode: couponPricing.promoCode,
        },
        promoCode: couponPricing.promoCode,
        billingHistory: [...(subscription.billingHistory || []), billingEntry],
      });
    }

    await userService.update(user.id, {
      'subscription.type': planType,
      'subscription.isActive': true,
      'subscription.interval': interval,
      'subscription.startDate': startDate.toISOString(),
      'subscription.endDate': endDate.toISOString(),
    });

    return ok({
      message: 'Coupon redeemed successfully. Subscription activated.',
      subscription,
      pricing: couponPricing,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to redeem coupon', 500);
  }
}
