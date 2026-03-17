import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { userService } from "@/services/userService";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const getBearerToken = (req: NextRequest) => {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Access denied. No token provided.", 401);
  }
  return header.slice(7);
};

const getAdminRoleByEmail = async (email?: string | null) => {
  if (!email) return null;
  const snapshot = await adminDb.collection("admins").where("email", "==", email.toLowerCase()).limit(1).get();
  if (snapshot.empty) return null;
  const role = snapshot.docs[0].data().role;
  return role === "owner" ? "owner" : "admin";
};

export const authenticateRequest = async (req: NextRequest) => {
  const token = getBearerToken(req);
  const decoded = await adminAuth.verifyIdToken(token);

  let user = await userService.findByFirebaseUid(decoded.uid);
  const elevatedRole =
    decoded.role === "admin" || decoded.role === "owner"
      ? decoded.role
      : await getAdminRoleByEmail(decoded.email);

  if (!user) {
    const displayName = decoded.name || "";
    const nameParts = displayName.split(" ");
    user = await userService.createWithId(decoded.uid, {
      firebaseUid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      displayName,
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      username: decoded.email?.split("@")[0] || "",
      avatar: decoded.picture || "",
      photoURL: decoded.picture || "",
      profileImage: decoded.picture || "",
      profilePicture: decoded.picture || "",
      role: elevatedRole || "user",
    });
  } else {
    const patch: Record<string, unknown> = {};

    if (decoded.picture && decoded.picture !== user.avatar) {
      patch.avatar = decoded.picture;
      patch.photoURL = decoded.picture;
      patch.profileImage = decoded.picture;
      patch.profilePicture = decoded.picture;
    }

    if (decoded.name && decoded.name !== user.displayName) {
      patch.displayName = decoded.name;
    }

    if (elevatedRole && user.role !== elevatedRole) {
      patch.role = elevatedRole;
    }

    if (Object.keys(patch).length > 0) {
      user = await userService.update(user.id, patch as Record<string, any>);
    }
  }

  if (!user?.isActive) {
    throw new AuthError("Account is deactivated.", 401);
  }

  return user;
};

export const requireAdmin = (user: Record<string, any>) => {
  if (!["admin", "owner"].includes(user.role)) {
    throw new AuthError("Admin access required.", 403);
  }
};
