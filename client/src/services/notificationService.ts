import { FieldValue, adminDb } from "@/lib/server/firebaseAdminFirestore";

type AnyObj = Record<string, any>;
const COLLECTION = "notifications";

const createNotificationData = (data: AnyObj): AnyObj => ({
  fromUserId: data.fromUserId || null,
  toUserId: data.toUserId || null,
  type: data.type || "room_invite",
  roomId: data.roomId || null,
  inviteToken: data.inviteToken || null,
  roomName: data.roomName || "",
  status: data.status || "pending",
  message: data.message || "",
  createdAt: data.createdAt || FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  expiresAt: data.expiresAt || null,
});

class NotificationService {
  private collection = adminDb.collection(COLLECTION);

  private getPrivateJoinRequestDocId(fromUserId: string, toUserId: string, roomId: string): string {
    return `private_join_${toUserId}_${fromUserId}_${roomId}`;
  }

  async createPrivateJoinRequestNotification(params: {
    fromUserId: string;
    toUserId: string;
    roomId: string;
    roomName: string;
    requesterName?: string;
  }) {
    const {
      fromUserId,
      toUserId,
      roomId,
      roomName,
      requesterName,
    } = params;

    const docId = this.getPrivateJoinRequestDocId(fromUserId, toUserId, roomId);
    const docRef = this.collection.doc(docId);
    const existing = await docRef.get();

    if (existing.exists) {
      const data = existing.data() as AnyObj;
      if (data?.status === "pending") {
        return { id: existing.id, ...data };
      }
    }

    const displayName =
      typeof requesterName === "string" && requesterName.trim().length > 0
        ? requesterName.trim()
        : "A user";

    const payload = createNotificationData({
      fromUserId,
      toUserId,
      type: "private_room_join_request",
      roomId,
      roomName,
      status: "pending",
      message: `${displayName} requested to join \"${roomName}\"`,
      createdAt: existing.exists ? FieldValue.serverTimestamp() : undefined,
    });

    await docRef.set(payload, { merge: true });
    return { id: docId, ...payload };
  }

  async create(notificationData: AnyObj) {
    const ref = this.collection.doc();
    const payload = createNotificationData(notificationData);
    await ref.set(payload);
    return { id: ref.id, ...payload };
  }

  async sendRoomInvitations(
    fromUserId: string,
    toUserIds: string[],
    roomId: string,
    roomName: string,
    inviteToken?: string
  ) {
    const batch = adminDb.batch();
    const notifications: AnyObj[] = [];

    for (const toUserId of toUserIds) {
      const ref = this.collection.doc();
      const payload = createNotificationData({
        fromUserId,
        toUserId,
        type: "room_invite",
        roomId,
        inviteToken: inviteToken || null,
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
      updatedAt: FieldValue.serverTimestamp(),
    });
    const doc = await ref.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  async rejectInvitation(notificationId: string) {
    const ref = this.collection.doc(notificationId);
    await ref.update({
      status: "rejected",
      updatedAt: FieldValue.serverTimestamp(),
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
