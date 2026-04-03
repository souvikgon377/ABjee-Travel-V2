import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "20");

    const snapshot = await adminDb
      .collection("travelPartnerRequests")
      .where("requester", "==", user.id)
      .get();

    let requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() as Record<string, any> }));
    if (status) {
      requests = requests.filter((request) => request.status === status);
    }

    requests = requests.sort((a, b) => {
      const aTs = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bTs = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bTs - aTs;
    });

    const total = requests.length;
    const offset = (page - 1) * limit;
    const paginated = requests.slice(offset, offset + limit);

    return ok({
      requests: paginated,
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
    return fail("Failed to get your travel partner requests", 500);
  }
}
