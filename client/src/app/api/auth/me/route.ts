import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    return ok({ user });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to get user profile", 500);
  }
}
