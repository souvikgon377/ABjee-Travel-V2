import { db, admin } from '../config/database.js';

const COLLECTION_NAME = 'notifications';

const createNotificationData = (data) => ({
  fromUserId: data.fromUserId || null,
  toUserId: data.toUserId || null,
  
  type: data.type || 'room_invite', // room_invite, room_left, room_removed, etc.
  
  roomId: data.roomId || null,
  roomName: data.roomName || '',
  
  status: data.status || 'pending', // pending, accepted, rejected
  
  message: data.message || '',
  
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  expiresAt: data.expiresAt || null, // Optional expiry date for invites
});

class NotificationService {
  constructor() {
    this.collection = db.collection(COLLECTION_NAME);
  }

  // Create a new notification
  async create(notificationData) {
    const notificationRef = this.collection.doc();
    const notification = createNotificationData({ ...notificationData, id: notificationRef.id });
    await notificationRef.set(notification);
    return { id: notificationRef.id, ...notification };
  }

  // Send room invitation to multiple users
  async sendRoomInvitations(fromUserId, toUserIds, roomId, roomName) {
    const batch = db.batch();
    const notifications = [];

    for (const toUserId of toUserIds) {
      const notificationRef = this.collection.doc();
      const notification = createNotificationData({
        fromUserId,
        toUserId,
        type: 'room_invite',
        roomId,
        roomName,
        status: 'pending',
        message: `You've been invited to join the private room "${roomName}"`,
      });
      batch.set(notificationRef, notification);
      notifications.push({ id: notificationRef.id, ...notification });
    }

    await batch.commit();
    return notifications;
  }

  // Get pending invitations for a user
  async getPendingInvitations(userId) {
    try {
      const snapshot = await this.collection
        .where('toUserId', '==', userId)
        .where('type', '==', 'room_invite')
        .where('status', '==', 'pending')
        .get();

      const invitations = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        invitations.push({ 
          id: doc.id, 
          ...data,
          // Convert Firestore Timestamp to ISO string if needed
          createdAt: data.createdAt?.toDate?.() || data.createdAt
        });
      });
      
      // Sort by createdAt in memory (descending)
      invitations.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB - dateA;
      });
      
      return invitations;
    } catch (error) {
      console.error('Error in getPendingInvitations:', error);
      throw error;
    }
  }

  // Get all notifications for a user
  async getUserNotifications(userId, limit = 50) {
    try {
      const snapshot = await this.collection
        .where('toUserId', '==', userId)
        .get();

      const notifications = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        notifications.push({ 
          id: doc.id, 
          ...data,
          // Convert Firestore Timestamp to ISO string if needed
          createdAt: data.createdAt?.toDate?.() || data.createdAt
        });
      });
      
      // Sort by createdAt in memory (descending) and limit
      notifications.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB - dateA;
      });
      
      return notifications.slice(0, limit);
    } catch (error) {
      console.error('Error in getUserNotifications:', error);
      throw error;
    }
  }

  // Accept an invitation
  async acceptInvitation(notificationId) {
    const notificationRef = this.collection.doc(notificationId);
    await notificationRef.update({
      status: 'accepted',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const doc = await notificationRef.get();
    return { id: doc.id, ...doc.data() };
  }

  // Reject an invitation
  async rejectInvitation(notificationId) {
    const notificationRef = this.collection.doc(notificationId);
    await notificationRef.update({
      status: 'rejected',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    const doc = await notificationRef.get();
    return { id: doc.id, ...doc.data() };
  }

  // Find invitation by room and user
  async findInvitation(roomId, userId, type = 'room_invite') {
    const snapshot = await this.collection
      .where('roomId', '==', roomId)
      .where('toUserId', '==', userId)
      .where('type', '==', type)
      .get();

    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Delete a notification
  async delete(notificationId) {
    await this.collection.doc(notificationId).delete();
    return true;
  }

  // Delete all invitations for a room
  async deleteRoomInvitations(roomId) {
    const snapshot = await this.collection
      .where('roomId', '==', roomId)
      .where('type', '==', 'room_invite')
      .get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    return true;
  }
}

export default new NotificationService();
