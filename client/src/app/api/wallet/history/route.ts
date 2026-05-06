import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";

export const runtime = "nodejs";

type WalletHistoryRow = {
  id: string;
  type: string;
  points: number;
  rupees: number;
  monthKey: string;
  placeId?: string | null;
  reviewId?: string | null;
  requestedAmount?: number | null;
  textPoints?: number | null;
  mediaPoints?: number | null;
  createdAt: string | null;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || "20")));

    const snapshot = await adminDb
      .collection("users")
      .doc(String(user.firebaseUid || user.id))
      .collection("walletTransactions")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rows: WalletHistoryRow[] = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        type: typeof data.type === "string" ? data.type : "unknown",
        points: asNumber(data.points),
        rupees: asNumber(data.rupees),
        monthKey: typeof data.monthKey === "string" ? data.monthKey : "",
        placeId: typeof data.placeId === "string" ? data.placeId : null,
        reviewId: typeof data.reviewId === "string" ? data.reviewId : null,
        requestedAmount: data.requestedAmount !== undefined ? asNumber(data.requestedAmount) : null,
        textPoints: data.textPoints !== undefined ? asNumber(data.textPoints) : null,
        mediaPoints: data.mediaPoints !== undefined ? asNumber(data.mediaPoints) : null,
        createdAt: toIsoString(data.createdAt),
      };
    });

    return ok({ rows, totalCount: rows.length });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : "Failed to load wallet history.";
    return fail(message, 500);
  }
}