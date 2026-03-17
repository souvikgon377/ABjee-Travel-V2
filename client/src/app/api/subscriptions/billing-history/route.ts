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
      return ok({ billingHistory: [] });
    }

    const billingHistory = [...(subscription.billingHistory || [])].sort(
      (a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    );

    return ok({ billingHistory });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get billing history", 500);
  }
}
