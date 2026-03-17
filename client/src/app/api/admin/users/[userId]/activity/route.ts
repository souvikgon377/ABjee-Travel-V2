import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { userId } = await params;
    const user = await userService.findById(userId);
    if (!user) return fail("User not found", 404);

    const activities = [
      {
        id: "1",
        type: "account_created",
        description: "Account created",
        timestamp: user.createdAt || new Date(),
        metadata: { source: "admin_panel" },
      },
      {
        id: "2",
        type: "profile_updated",
        description: "Profile information updated",
        timestamp: user.updatedAt || new Date(),
        metadata: { fields: ["displayName", "city"] },
      },
      ...(user.lastSeen
        ? [
            {
              id: "3",
              type: "last_seen",
              description: "Last active on platform",
              timestamp: user.lastSeen,
              metadata: {},
            },
          ]
        : []),
    ].sort((a, b) => {
      const aTs = new Date(a.timestamp as any).getTime();
      const bTs = new Date(b.timestamp as any).getTime();
      return bTs - aTs;
    });

    return ok({ activities });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get user activity", 500);
  }
}
