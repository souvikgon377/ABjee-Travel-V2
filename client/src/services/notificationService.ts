import { FieldValue, adminDb } from "@/lib/server/firebaseAdminFirestore";

type AnyObj = Record<string, any>;
const COLLECTION = "notifications";

const createNotificationData = (data: AnyObj): AnyObj => ({
  fromUserId: data.fromUserId || null,
  fromUserName: data.fromUserName || null,
  fromUserEmail: data.fromUserEmail || null,
  toUserId: data.toUserId || null,
  type: data.type || "room_invite",
  roomId: data.roomId || null,
  inviteToken: data.inviteToken || null,
  roomName: data.roomName || "",
  roomVisibility: data.roomVisibility || null,
  roomType: data.roomType || null,
  details: data.details || null,
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

  private getRoomInviteDocId(fromUserId: string, toUserId: string, roomId: string): string {
    return `room_invite_${toUserId}_${fromUserId}_${roomId}`;
  }

  private getPrivateRoomMessageDocId(toUserId: string, roomId: string): string {
    return `private_room_message_${toUserId}_${roomId}`;
  }

  async createPrivateJoinRequestNotification(params: {
    fromUserId: string;
    toUserId: string;
    roomId: string;
    roomName: string;
    requesterName?: string;
    requesterEmail?: string;
    roomVisibility?: string;
  }) {
    const {
      fromUserId,
      toUserId,
      roomId,
      roomName,
      requesterName,
      requesterEmail,
      roomVisibility,
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
      fromUserName: displayName,
      fromUserEmail: requesterEmail || null,
      toUserId,
      type: "private_room_join_request",
      roomId,
      roomName,
      roomVisibility: roomVisibility || "private",
      roomType: "private",
      status: "pending",
      message: `${displayName} sent a join request for \"${roomName}\"`,
      details: {
        action: "join_request",
        requesterName: displayName,
        requesterEmail: requesterEmail || null,
        roomName,
        roomId,
        roomVisibility: roomVisibility || "private",
      },
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

  async upsertPrivateRoomMessageNotifications(params: {
    fromUserId: string;
    fromUserName?: string;
    fromUserEmail?: string;
    recipientIds: string[];
    roomId: string;
    roomName: string;
    messagePreview: string;
  }) {
    const {
      fromUserId,
      fromUserName,
      fromUserEmail,
      recipientIds,
      roomId,
      roomName,
      messagePreview,
    } = params;

    const normalizedSenderName =
      typeof fromUserName === "string" && fromUserName.trim().length > 0
        ? fromUserName.trim()
        : "A member";

    const normalizedPreview = typeof messagePreview === "string" ? messagePreview.trim() : "";
    const previewText = normalizedPreview.length > 0 ? normalizedPreview : "New message";
    const MAX_PREVIEW_LINES = 50;

    const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id && id !== fromUserId)));

    for (const toUserId of uniqueRecipients) {
      const docId = this.getPrivateRoomMessageDocId(toUserId, roomId);
      const ref = this.collection.doc(docId);
      await adminDb.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        const existingData = existing.exists ? (existing.data() as AnyObj) : null;
        const existingDetails =
          existingData?.details && typeof existingData.details === "object"
            ? (existingData.details as AnyObj)
            : null;
        const existingPreviews = Array.isArray(existingDetails?.messagePreviews)
          ? existingDetails.messagePreviews.filter((line: unknown): line is string => typeof line === "string" && line.trim().length > 0)
          : [];
        const unseenCountRaw = Number(existingData?.unreadCount ?? existingDetails?.unreadCount ?? 0);
        const existingUnseenCount = Number.isFinite(unseenCountRaw) && unseenCountRaw > 0
          ? Math.floor(unseenCountRaw)
          : 0;
        const unseenCount = existingUnseenCount + 1;
        const messagePreviews = [previewText, ...existingPreviews].slice(0, MAX_PREVIEW_LINES);

        const payload = createNotificationData({
          fromUserId,
          fromUserName: normalizedSenderName,
          fromUserEmail: fromUserEmail || null,
          toUserId,
          type: "private_room_message",
          roomId,
          roomName,
          roomVisibility: "private",
          roomType: "private",
          status: "pending",
          message: `${normalizedSenderName}: ${previewText}`,
          unreadCount: unseenCount,
          details: {
            action: "room_message",
            senderName: normalizedSenderName,
            roomName,
            roomId,
            messagePreview: previewText,
            messagePreviews,
            unreadCount: unseenCount,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        transaction.set(ref, payload, { merge: true });
      });
    }

    return { notifiedCount: uniqueRecipients.length };
  }

  async sendRoomInvitations(
    fromUserId: string,
    toUserIds: string[],
    roomId: string,
    roomName: string,
    inviteToken?: string,
    inviterName?: string,
    inviterEmail?: string
  ) {
    const notifications: AnyObj[] = [];
    let sentCount = 0;
    let skippedPendingCount = 0;
    let skippedAlreadyHandledCount = 0;

    for (const toUserId of toUserIds) {
      const docId = this.getRoomInviteDocId(fromUserId, toUserId, roomId);
      const ref = this.collection.doc(docId);
      const existing = await ref.get();

      if (existing.exists) {
        const existingData = existing.data() as AnyObj;
        if (existingData?.status === "pending") {
          notifications.push({ id: existing.id, ...existingData });
          skippedPendingCount += 1;
          continue;
        }

        // Allow re-invite only after an explicit rejection.
        if (existingData?.status && existingData.status !== "rejected") {
          notifications.push({ id: existing.id, ...existingData });
          skippedAlreadyHandledCount += 1;
          continue;
        }
      }

      const normalizedInviterName =
        typeof inviterName === "string" && inviterName.trim().length > 0
          ? inviterName.trim()
          : "Community admin";
      const payload = createNotificationData({
        fromUserId,
        fromUserName: normalizedInviterName,
        fromUserEmail: inviterEmail || null,
        toUserId,
        type: "room_invite",
        roomId,
        inviteToken: inviteToken || null,
        roomName,
        roomVisibility: "private",
        roomType: "private",
        status: "pending",
        message: `${normalizedInviterName} invited you to join the private community "${roomName}"`,
        details: {
          action: "invite",
          inviterName: normalizedInviterName,
          inviterEmail: inviterEmail || null,
          roomName,
          roomId,
          roomVisibility: "private",
          inviteToken: inviteToken || null,
        },
        createdAt: existing.exists ? FieldValue.serverTimestamp() : undefined,
      });

      await ref.set(payload, { merge: true });
      notifications.push({ id: ref.id, ...payload });
      sentCount += 1;
    }

    return {
      notifications,
      summary: {
        requestedCount: toUserIds.length,
        sentCount,
        skippedPendingCount,
        skippedAlreadyHandledCount,
      },
    };
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

  async clearUserNotifications(userId: string) {
    const snapshot = await this.collection.where("toUserId", "==", userId).get();
    if (snapshot.empty) return 0;

    let deletedCount = 0;
    let batch = adminDb.batch();
    let operationCount = 0;

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      operationCount += 1;
      deletedCount += 1;

      // Firestore write batches are limited to 500 operations.
      if (operationCount === 500) {
        await batch.commit();
        batch = adminDb.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }

    return deletedCount;
  }

  async clearRoomNotifications(userId: string, roomId: string) {
    if (!roomId) return 0;

    const snapshot = await this.collection
      .where("toUserId", "==", userId)
      .where("roomId", "==", roomId)
      .get();

    if (snapshot.empty) return 0;

    let deletedCount = 0;
    let batch = adminDb.batch();
    let operationCount = 0;

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      operationCount += 1;
      deletedCount += 1;

      if (operationCount === 500) {
        await batch.commit();
        batch = adminDb.batch();
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }

    return deletedCount;
  }
}

export const notificationService = new NotificationService();
