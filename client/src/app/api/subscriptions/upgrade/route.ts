import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, invalidateUserProfileCache } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { subscriptionService } from '@/services/subscriptionService';
import { userService } from '@/services/userService';
import {
  getConfiguredPrivateRoomLimits,
  getConfiguredSubscriptionPlans,
} from '@/lib/server/subscriptionPlans';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();
    const { planType, interval = "monthly", paymentMethod } = body;

    if (!planType || !["pro", "premium"].includes(planType)) {
      return fail("Invalid plan type", 400);
    }

    if (!["monthly", "yearly"].includes(interval)) {
      return fail("Invalid billing interval", 400);
    }

    const [configuredPlans, privateRoomLimits] = await Promise.all([
      getConfiguredSubscriptionPlans(),
      getConfiguredPrivateRoomLimits(),
    ]);
    const selectedPlan = configuredPlans[planType as 'pro' | 'premium'];
    const startDate = new Date();
    const endDate = new Date();
    if (interval === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    let subscription = await subscriptionService.findByUserId(user.id);

    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: interval === "yearly" ? selectedPlan.yearlyPrice : selectedPlan.price,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = privateRoomLimits[planType as 'pro' | 'premium'];

    if (!subscription) {
      subscription = await subscriptionService.create({
        user: user.id,
        plan,
        status: "active",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        paymentMethod: paymentMethod || { type: "card" },
        billingHistory: [
          {
            amount: plan.price.amount,
            currency: plan.price.currency,
            status: "paid",
            description: `${selectedPlan.name} - ${interval} subscription`,
            invoiceId: `INV-${Date.now()}`,
            paymentDate: new Date().toISOString(),
          },
        ],
      });
    } else {
      subscription = await subscriptionService.update(subscription.id, {
        plan,
        status: "active",
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        autoRenew: true,
        cancellation: null,
        ...(paymentMethod ? { paymentMethod } : {}),
        billingHistory: [
          ...(subscription.billingHistory || []),
          {
            amount: plan.price.amount,
            currency: plan.price.currency,
            status: "paid",
            description: `${selectedPlan.name} - ${interval} subscription`,
            invoiceId: `INV-${Date.now()}`,
            paymentDate: new Date().toISOString(),
          },
        ],
      });
    }

    await userService.update(user.id, {
      "subscription.type": planType,
      "subscription.isActive": true,
      "subscription.interval": interval,
      "subscription.startDate": startDate.toISOString(),
      "subscription.endDate": endDate.toISOString(),
    });

    // Invalidate auth cache so the new subscription status is reflected immediately
    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    return ok({
      message: "Subscription upgraded successfully",
      subscription,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to upgrade subscription", 500);
  }
}
