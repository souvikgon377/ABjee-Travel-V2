import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdminFirestore";
import { adminAuth } from "@/lib/server/firebaseAdminAuth";

export const runtime = "nodejs";

/**
 * POST /api/users/batch
 * Body: { ids: string[] }
 * Returns: { users: Record<string, { displayName, firstName, lastName, username, email, avatar }> }
 *
 * Looks up users by their Firestore document IDs. For any IDs not found in
 * Firestore, falls back to Firebase Auth to resolve at least a displayName.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.slice(0, 100) : [];

    if (ids.length === 0) {
      return NextResponse.json({ users: {} });
    }

    const result: Record<string, any> = {};
    const missingFromFirestore: string[] = [];

    // Batch fetch from Firestore (max 10 per getAll call)
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const refs = chunk.map((id) => adminDb.collection("users").doc(id));
        const docs = await adminDb.getAll(...refs);
        docs.forEach((doc, idx) => {
          if (doc.exists) {
            const data = doc.data()!;
            result[chunk[idx]] = {
              id: doc.id,
              displayName: data.displayName || "",
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              username: data.username || "",
              email: data.email || "",
              avatar: data.avatar || data.photoURL || data.profileImage || "",
            };
          } else {
            missingFromFirestore.push(chunk[idx]);
          }
        });
      })
    );

    // Fallback: try Firebase Auth for users missing from Firestore
    if (missingFromFirestore.length > 0) {
      await Promise.all(
        missingFromFirestore.map(async (uid) => {
          try {
            const authUser = await adminAuth.getUser(uid);
            result[uid] = {
              id: uid,
              displayName: authUser.displayName || "",
              firstName: "",
              lastName: "",
              username: "",
              email: authUser.email || "",
              avatar: authUser.photoURL || "",
            };
          } catch {
            // User doesn't exist in Auth either — skip
          }
        })
      );
    }

    return NextResponse.json({ users: result });
  } catch (error: any) {
    console.error("[API:users/batch] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users", users: {} },
      { status: 500 }
    );
  }
}
