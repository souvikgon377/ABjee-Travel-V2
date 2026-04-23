import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { travelPartnerRequestService } from "@/services/travelPartnerRequestService";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { requestId } = await params;
    const request: any = await travelPartnerRequestService.findById(requestId);

    if (!request) return fail("Travel partner request not found", 404);

    travelPartnerRequestService.incrementViews(request.id).catch(() => {});

    let requester = null;
    if (request.requester) {
      const requestUser = await userService.findById(request.requester);
      if (requestUser) {
        requester = {
          id: requestUser.id,
          username: requestUser.username,
          firstName: requestUser.firstName,
          lastName: requestUser.lastName,
          avatar: requestUser.avatar,
          bio: requestUser.bio,
          travelInterests: requestUser.travelInterests,
        };
      }
    }

    const userResponse = (request.responses || []).find((response: any) => response.user === user.id);

    return ok({
      request: {
        ...request,
        requester,
        views: (request.views || 0) + 1,
        isOwner: request.requester === user.id,
        hasResponded: !!userResponse,
        userResponse,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get travel partner request", 500);
  }
}
