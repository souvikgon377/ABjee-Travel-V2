import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { travelPartnerRequestService } from "@/services/travelPartnerRequestService";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await authenticateRequest(req);
    const { requestId } = await params;
    const body = await req.json();
    const message = (body?.message || "").trim();

    if (message.length < 10 || message.length > 500) {
      return fail("Response message must be between 10 and 500 characters", 400);
    }

    const request = await travelPartnerRequestService.findById(requestId);
    if (!request) return fail("Travel partner request not found", 404);
    if (request.status !== "active") return fail("This request is no longer active", 400);
    if (request.requester === user.id) return fail("You cannot respond to your own request", 400);
    if (travelPartnerRequestService.isExpired(request)) return fail("This request has expired", 400);

    try {
      const updated = await travelPartnerRequestService.addResponse(request.id, user.id, message);
      const responses = updated?.responses || [];
      return ok({
        responseId: responses[responses.length - 1]?.respondedAt || Date.now(),
        message: "Response sent successfully",
      });
    } catch (error: any) {
      if (error?.message === "User has already responded to this request") {
        return fail("You have already responded to this request", 400);
      }
      throw error;
    }
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to send response", 500);
  }
}
