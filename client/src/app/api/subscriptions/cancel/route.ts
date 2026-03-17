import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { subscriptionService } from "@/services/subscriptionService";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "No reason provided";
    const cancelAtPeriodEnd = body.cancelAtPeriodEnd !== false;

    const subscription = await subscriptionService.findByUserId(user.id);
    if (!subscription) {
      return fail("No active subscription found", 404);
    }

    const cancelled = await subscriptionService.cancel(subscription.id, reason, cancelAtPeriodEnd);

    if (!cancelAtPeriodEnd) {
      await userService.update(user.id, {
        "subscription.type": "free",
        "subscription.isActive": false,
      });
    }

    return ok({
      message: cancelAtPeriodEnd
        ? "Subscription will be cancelled at the end of the current period"
        : "Subscription cancelled immediately",
      subscription: {
        status: cancelled?.status,
        cancellation: cancelled?.cancellation,
        endDate: cancelled?.endDate,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to cancel subscription", 500);
  }
}
