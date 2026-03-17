import { NextRequest } from "next/server";
import { authenticateRequest, AuthError, requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");
    const search = (searchParams.get("search") || "").toLowerCase();
    const role = searchParams.get("role") || "all";
    const status = searchParams.get("status") || "all";

    const snapshot = await adminDb.collection("users").get();
    let users = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;
      return {
        id: doc.id,
        ...data,
        phoneNumber: data.phone || data.phoneNumber || "",
        createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
        lastSeen: data.lastSeen?.toDate?.() || data.lastSeen || null,
      };
    });

    if (role !== "all") {
      users = users.filter((user) => user.role === role);
    }

    if (status === "active") {
      users = users.filter((user) => user.isActive !== false);
    } else if (status === "inactive") {
      users = users.filter((user) => user.isActive === false);
    }

    if (search) {
      users = users.filter((user) => {
        const hay = `${user.email || ""} ${user.displayName || ""} ${user.username || ""}`.toLowerCase();
        return hay.includes(search);
      });
    }

    const total = users.length;
    const offset = (page - 1) * limit;
    const paginated = users.slice(offset, offset + limit);

    return ok({
      users: paginated,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to get users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json();
    const { email, displayName, role = "user", city, phoneNumber } = body || {};

    if (!email || !displayName) {
      return fail("Email and display name are required", 400);
    }

    if (!["user", "moderator", "admin"].includes(role)) {
      return fail("Invalid role", 400);
    }

    const existing = await userService.findByEmail(String(email));
    if (existing) {
      return fail("User with this email already exists", 400);
    }

    const ref = adminDb.collection("users").doc();
    const userData = {
      email: String(email).toLowerCase(),
      displayName,
      role,
      city: city || "",
      phone: phoneNumber || "",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`,
    };

    await ref.set(userData);

    return ok(
      {
        message: "User created successfully",
        user: { id: ref.id, ...userData, phoneNumber: userData.phone },
      },
      201
    );
  } catch (error: any) {
    if (error instanceof AuthError) return fail(error.message, error.status);
    return fail("Failed to create user", 500);
  }
}
