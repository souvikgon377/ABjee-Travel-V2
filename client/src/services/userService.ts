import { admin, adminDb } from "@/lib/server/firebaseAdmin";

const COLLECTION = "users";

type AnyObj = Record<string, any>;

const createUserData = (data: AnyObj): AnyObj => ({
  firebaseUid: data.firebaseUid || null,
  email: data.email || "",
  emailVerified: data.emailVerified || false,
  displayName: data.displayName || "",
  firstName: data.firstName || "",
  lastName: data.lastName || "",
  username: data.username || null,
  address: data.address || "",
  city: data.city || "",
  zipCode: data.zipCode || "",
  avatar: data.avatar || null,
  bio: data.bio || "",
  phone: data.phone || null,
  profileImage: data.profileImage || null,
  profilePicture: data.profilePicture || null,
  photoURL: data.photoURL || null,
  role: data.role || "user",
  travelInterests: data.travelInterests || [],
  preferredDestinations: data.preferredDestinations || [],
  subscription: {
    type: data.subscription?.type || "free",
    startDate: data.subscription?.startDate || null,
    endDate: data.subscription?.endDate || null,
    isActive: data.subscription?.isActive || false,
  },
  isOnline: data.isOnline || false,
  lastSeen: data.lastSeen || admin.firestore.FieldValue.serverTimestamp(),
  joinedChatRooms: data.joinedChatRooms || [],
  isVerified: data.isVerified || false,
  isActive: data.isActive !== undefined ? data.isActive : true,
  preferences: {
    notifications: data.preferences?.notifications !== undefined ? data.preferences.notifications : true,
    theme: data.preferences?.theme || "light",
  },
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

class UserService {
  private collection = adminDb.collection(COLLECTION);

  async createWithId(uid: string, userData: AnyObj) {
    const ref = this.collection.doc(uid);
    const payload = createUserData({ ...userData, firebaseUid: uid });
    await ref.set(payload);
    return { id: uid, ...payload };
  }

  async findById(userId: string) {
    const doc = await this.collection.doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Record<string, any>;
  }

  async findByFirebaseUid(firebaseUid: string) {
    const snapshot = await this.collection.where("firebaseUid", "==", firebaseUid).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Record<string, any>;
  }

  async findByEmail(email: string) {
    const snapshot = await this.collection.where("email", "==", email.toLowerCase()).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Record<string, any>;
  }

  async update(userId: string, updateData: AnyObj) {
    await this.collection.doc(userId).update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return this.findById(userId);
  }

  async delete(userId: string) {
    await this.collection.doc(userId).delete();
    return true;
  }

  async getAll({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
    let query: FirebaseFirestore.Query = this.collection.orderBy("createdAt", "desc");
    if (limit) query = query.limit(limit);
    if (offset) query = query.offset(offset);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, any>));
  }

  async updateStatus(userId: string, isOnline: boolean) {
    return this.update(userId, {
      isOnline,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  hasActiveSubscription(user: AnyObj) {
    return !!(user.subscription?.isActive && user.subscription?.endDate && new Date(user.subscription.endDate) > new Date());
  }

  canAccessPrivateChat(user: AnyObj) {
    return this.hasActiveSubscription(user) && ["pro", "premium"].includes(user.subscription?.type);
  }
}

export const userService = new UserService();
