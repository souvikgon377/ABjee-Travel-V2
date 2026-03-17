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
        usage: {
          privateChats: { used: 0, limit: 0, unlimited: false },
          travelRequests: { used: 0, limit: 1, unlimited: false },
          fileUpload: { limit: 5 },
          lastResetDate: null,
        },
      });
    }

    return ok({
      usage: {
        privateChats: {
          used: subscription.usage?.privateChatsUsed || 0,
          limit: subscription.features?.maxPrivateChats || 0,
          unlimited: subscription.features?.maxPrivateChats === -1,
        },
        travelRequests: {
          used: subscription.usage?.travelRequestsUsed || 0,
          limit: subscription.features?.travelPartnerRequests || 0,
          unlimited: subscription.features?.travelPartnerRequests === -1,
        },
        fileUpload: { limit: subscription.features?.fileUploadLimit || 5 },
        lastResetDate: subscription.usage?.lastResetDate || null,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get usage statistics", 500);
  }
}
