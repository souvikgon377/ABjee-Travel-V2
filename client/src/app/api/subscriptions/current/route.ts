import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { subscriptionService } from "@/services/subscriptionService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const subscription = await subscriptionService.findByUserId(user.id);

    if (!subscription) {
      return ok({
        subscription: {
          id: null,
          plan: { type: "free", name: "Free Plan", price: { amount: 0, currency: "USD" } },
          status: "active",
          interval: "monthly",
          startDate: null,
          endDate: null,
          isActive: true,
          features: subscriptionService.getFeaturesForPlan("free"),
          usage: { privateChatsUsed: 0, travelRequestsUsed: 0 },
          billingHistory: [],
          autoRenew: false,
        },
      });
    }

    return ok({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        interval: subscription.plan?.price?.interval || "monthly",
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscriptionService.isActive(subscription),
        features: subscription.features,
        usage: subscription.usage,
        nextBillingDate: subscription.nextBillingDate,
        autoRenew: subscription.autoRenew,
        cancellation: subscription.cancellation,
        billingHistory: subscription.billingHistory || [],
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get subscription details", 500);
  }
}
