import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") || String(DEFAULT_LIMIT))));

    // Perform search (no built-in user filtering, return empty for now)
    // User search should be implemented separately if needed
    const result = {
      results: [],
      totalCount: 0,
      hasMore: false,
      source: 'error' as const,
      latencyMs: 0,
    };

    return ok({
      users: result.results,
      pagination: {
        page,
        limit,
        total: result.totalCount,
        hasNext: result.hasMore,
        hasPrev: page > 1,
      },
      metrics: {
        latencyMs: result.latencyMs,
        source: result.source
      }
    });

  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    console.error("[UsersSearch] Error:", error);
    return fail("Failed to search users", 500);
  }
}
