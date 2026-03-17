import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    await userService.updateStatus(user.id, false);
    return ok({ message: "Logged out successfully" });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Logout failed", 500);
  }
}
