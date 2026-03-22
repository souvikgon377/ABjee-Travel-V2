import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { subscriptionService } from "@/services/subscriptionService";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

const SUBSCRIPTION_PLANS: Record<string, any> = {
  pro: {
    type: "pro",
    name: "Paid Plan",
    price: { amount: 2, currency: "USD", interval: "monthly" },
    yearlyPrice: { amount: 15, currency: "USD", interval: "yearly" },
  },
  premium: {
    type: "premium",
    name: "Premium Plan",
    price: { amount: 2, currency: "USD", interval: "monthly" },
    yearlyPrice: { amount: 15, currency: "USD", interval: "yearly" },
  },
};

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

    const selectedPlan = SUBSCRIPTION_PLANS[planType];
    const startDate = new Date();
    const endDate = new Date();
    if (interval === "yearly") endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    let subscription = await subscriptionService.findByUserId(user.id);

    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: interval === "yearly" ? selectedPlan.yearlyPrice : selectedPlan.price,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = interval === "yearly" ? 10 : 3;

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
