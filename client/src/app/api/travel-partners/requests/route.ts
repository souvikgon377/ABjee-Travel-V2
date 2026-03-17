import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { travelPartnerRequestService } from "@/services/travelPartnerRequestService";
import { userService } from "@/services/userService";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const COLLECTION = "travelPartnerRequests";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const destination = searchParams.get("destination")?.toLowerCase() || "";
    const country = searchParams.get("country")?.toLowerCase() || "";
    const city = searchParams.get("city")?.toLowerCase() || "";
    const travelStyle = searchParams.get("travelStyle") || "";
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "20");

    const snapshot = await adminDb
      .collection(COLLECTION)
      .where("status", "==", "active")
      .where("isPublic", "==", true)
      .get();

    const now = Date.now();
    let requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() as Record<string, any> }));

    requests = requests
      .filter((request) => {
        if (request.requester === user.id) return false;
        const startTs = request.startDate ? new Date(request.startDate).getTime() : 0;
        const expiresTs = request.expiresAt ? new Date(request.expiresAt).getTime() : 0;
        if (startTs && startTs < now) return false;
        if (expiresTs && expiresTs < now) return false;
        return true;
      })
      .filter((request) => {
        if (destination) {
          const hay = `${request.destination?.country || ""} ${request.destination?.city || ""} ${request.destination?.region || ""}`.toLowerCase();
          if (!hay.includes(destination)) return false;
        }
        if (country && !(request.destination?.country || "").toLowerCase().includes(country)) return false;
        if (city && !(request.destination?.city || "").toLowerCase().includes(city)) return false;
        if (travelStyle && request.travelStyle !== travelStyle) return false;
        return true;
      });

    const total = requests.length;
    const offset = (page - 1) * limit;
    const paginated = requests.slice(offset, offset + limit);

    const enriched = await Promise.all(
      paginated.map(async (request) => {
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
              travelInterests: requestUser.travelInterests,
            };
          }
        }

        travelPartnerRequestService.incrementViews(request.id).catch(() => {});

        return {
          ...request,
          requester,
          hasResponded: (request.responses || []).some((response: any) => response.user === user.id),
        };
      })
    );

    return ok({
      requests: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get travel partner requests", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json();

    const activeRequestsSnapshot = await adminDb
      .collection(COLLECTION)
      .where("requester", "==", user.id)
      .where("status", "==", "active")
      .get();

    const maxRequests = user.subscription?.type === "premium" ? -1 : user.subscription?.type === "pro" ? 5 : 1;
    if (maxRequests !== -1 && activeRequestsSnapshot.size >= maxRequests) {
      return fail(`You have reached your limit of ${maxRequests} active travel partner request(s)`, 403, {
        upgradeRequired: true,
      });
    }

    const created = await travelPartnerRequestService.create({ ...body, requester: user.id });
    return ok({ request: created, message: "Travel partner request created successfully" }, 201);
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to create travel partner request", 500);
  }
}
