import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdminAuth";
import { userService } from "@/services/userService";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7);
};

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return fail("Access denied. No token provided.", 401);

    const decoded = await adminAuth.verifyIdToken(token, true);
    const existing = await userService.findByFirebaseUid(decoded.uid);
    if (existing) return ok({ user: existing });

    const body = await req.json().catch(() => ({}));
    const displayName = String(body?.displayName || decoded.name || "").trim();
    const nameParts = displayName.split(" ").filter(Boolean);
    const email = String(decoded.email || body?.email || "").trim().toLowerCase();

    const user = await userService.createWithId(decoded.uid, {
      firebaseUid: decoded.uid,
      email,
      emailVerified: !!decoded.email_verified,
      displayName,
      firstName: body?.firstName || nameParts[0] || "",
      lastName: body?.lastName || nameParts.slice(1).join(" ") || "",
      username: body?.username || email.split("@")[0] || "",
      avatar: decoded.picture || body?.photoURL || "",
      photoURL: decoded.picture || body?.photoURL || "",
      profileImage: decoded.picture || body?.photoURL || "",
      profilePicture: decoded.picture || body?.photoURL || "",
      role: "user",
    });

    return ok({ user }, 201);
  } catch (error: any) {
    const code = String(error?.code || "");
    if (code.startsWith("auth/")) {
      return fail("Invalid or expired authentication token.", 401);
    }
    return fail("Failed to register user profile", 500);
  }
}
