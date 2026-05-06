import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { redeemWalletBalance } from "@/lib/server/rebateWallet";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = (await req.json().catch(() => ({}))) as { amount?: unknown };
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return fail("amount is required and must be greater than zero.", 400);
    }

    const result = await redeemWalletBalance({
      userId: String(user.firebaseUid || user.id),
      amount,
    });

    return ok({
      message: "Wallet redemption completed.",
      redeemedAmount: result.redeemedAmount,
      remainingThisMonth: result.remainingThisMonth,
      wallet: result.wallet,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : "Failed to redeem wallet balance.";
    return fail(message, 500);
  }
}