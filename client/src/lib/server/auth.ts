import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdminAuth";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { userService } from "@/services/userService";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

const isAdminDataStoreError = (error: any) => {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code.includes("firestore") ||
    code.includes("permission") ||
    code.includes("unavailable") ||
    message.includes("firestore") ||
    message.includes("database") ||
    message.includes("default credentials") ||
    message.includes("project id") ||
    message.includes("permission") ||
    message.includes("unavailable")
  );
};

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
  let decoded: Record<string, any>;

  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (error: any) {
    const code = typeof error?.code === "string" ? error.code : "";
    const message = String(error?.message || "").toLowerCase();

    if (
      code.startsWith("auth/") ||
      message.includes("token") ||
      message.includes("decod")
    ) {
      throw new AuthError("Invalid or expired authentication token.", 401);
    }

    throw error;
  }

  let user: Record<string, any> | null = null;

  try {
    user = await userService.findByFirebaseUid(decoded.uid);
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
  } catch (error: any) {
    if (!isAdminDataStoreError(error)) {
      throw error;
    }

    const displayName = decoded.name || "";
    const nameParts = displayName.split(" ");
    user = {
      id: decoded.uid,
      firebaseUid: decoded.uid,
      email: decoded.email || "",
      emailVerified: !!decoded.email_verified,
      displayName,
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      username: decoded.email?.split("@")[0] || "",
      avatar: decoded.picture || "",
      photoURL: decoded.picture || "",
      profileImage: decoded.picture || "",
      profilePicture: decoded.picture || "",
      role: decoded.role === "admin" || decoded.role === "owner" ? decoded.role : "user",
      isActive: true,
      _degradedAuth: true,
    };
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
