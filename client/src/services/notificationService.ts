import { admin, adminDb } from "@/lib/server/firebaseAdmin";

type AnyObj = Record<string, any>;
const COLLECTION = "notifications";

const createNotificationData = (data: AnyObj): AnyObj => ({
  fromUserId: data.fromUserId || null,
  toUserId: data.toUserId || null,
  type: data.type || "room_invite",
  roomId: data.roomId || null,
  roomName: data.roomName || "",
  status: data.status || "pending",
  message: data.message || "",
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  expiresAt: data.expiresAt || null,
});

class NotificationService {
  private collection = adminDb.collection(COLLECTION);

  async create(notificationData: AnyObj) {
    const ref = this.collection.doc();
    const payload = createNotificationData(notificationData);
    await ref.set(payload);
    return { id: ref.id, ...payload };
  }

  async sendRoomInvitations(fromUserId: string, toUserIds: string[], roomId: string, roomName: string) {
    const batch = adminDb.batch();
    const notifications: AnyObj[] = [];

    for (const toUserId of toUserIds) {
      const ref = this.collection.doc();
      const payload = createNotificationData({
        fromUserId,
        toUserId,
        type: "room_invite",
        roomId,
        roomName,
        status: "pending",
        message: `You've been invited to join the private community "${roomName}"`,
      });

      batch.set(ref, payload);
      notifications.push({ id: ref.id, ...payload });
    }

    await batch.commit();
    return notifications;
  }

  async getUserNotifications(userId: string, limit = 50) {
    const snapshot = await this.collection.where("toUserId", "==", userId).get();
    const notifications = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: AnyObj, b: AnyObj) => {
        const aTs = a.createdAt?.toDate?.()?.getTime?.() ?? new Date(a.createdAt || 0).getTime();
        const bTs = b.createdAt?.toDate?.()?.getTime?.() ?? new Date(b.createdAt || 0).getTime();
        return bTs - aTs;
      });

    return notifications.slice(0, limit);
  }

  async getPendingInvitations(userId: string) {
    const snapshot = await this.collection
      .where("toUserId", "==", userId)
      .where("type", "==", "room_invite")
      .where("status", "==", "pending")
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a: AnyObj, b: AnyObj) => {
        const aTs = a.createdAt?.toDate?.()?.getTime?.() ?? new Date(a.createdAt || 0).getTime();
        const bTs = b.createdAt?.toDate?.()?.getTime?.() ?? new Date(b.createdAt || 0).getTime();
        return bTs - aTs;
      });
  }

  async acceptInvitation(notificationId: string) {
    const ref = this.collection.doc(notificationId);
    await ref.update({
      status: "accepted",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async rejectInvitation(notificationId: string) {
    const ref = this.collection.doc(notificationId);
    await ref.update({
      status: "rejected",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async delete(notificationId: string) {
    await this.collection.doc(notificationId).delete();
    return true;
  }
}

export const notificationService = new NotificationService();
