import { NextRequest } from "next/server";
import { authenticateRequest, AuthError } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { userService } from "@/services/userService";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "50");

    const allUsers = await userService.getAll({ limit: 500 });

    let filtered = allUsers.filter((user) => user.isActive !== false && user.id !== currentUser.id);

    if (q) {
      filtered = filtered.filter((user) => {
        const username = (user.username || "").toLowerCase();
        const firstName = (user.firstName || "").toLowerCase();
        const lastName = (user.lastName || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        return username.includes(q) || firstName.includes(q) || lastName.includes(q) || fullName.includes(q);
      });
    }

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const users = filtered.slice(offset, offset + limit).map((user) => ({
      id: user.id,
      _id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      photoURL: user.photoURL,
      photoUrl: user.photoUrl,
      profileImage: user.profileImage,
      profilePicture: user.profilePicture,
      imageUrl: user.imageUrl,
      image: user.image,
      picture: user.picture,
      bio: user.bio,
      travelInterests: user.travelInterests,
      preferredDestinations: user.preferredDestinations,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    }));

    return ok({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail("Failed to search users", 500);
  }
}
