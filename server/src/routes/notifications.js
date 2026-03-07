import express from 'express';
import { authenticate } from '../middleware/auth.js';
import NotificationService from '../models/Notification.js';
import { db, admin } from '../config/database.js';

const router = express.Router();

// Get all notifications for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await NotificationService.getUserNotifications(req.user.firebaseUid, limit);

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
    });
  }
});

// Get pending invitations for current user
router.get('/pending', authenticate, async (req, res) => {
  try {
    const invitations = await NotificationService.getPendingInvitations(req.user.firebaseUid);

    res.json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    console.error('Error fetching pending invitations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending invitations',
      error: error.message,
    });
  }
});

// Send room invitations to multiple users
router.post('/send-invitations', authenticate, async (req, res) => {
  try {
    const { roomId, roomName, memberIds } = req.body;

    if (!roomId || !roomName || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: roomId, roomName, memberIds',
      });
    }

    const notifications = await NotificationService.sendRoomInvitations(
      req.user.firebaseUid,
      memberIds,
      roomId,
      roomName
    );

    res.json({
      success: true,
      message: `Invitations sent to ${notifications.length} members`,
      data: notifications,
    });
  } catch (error) {
    console.error('Error sending invitations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitations',
      error: error.message,
    });
  }
});

// Accept an invitation
router.post('/:notificationId/accept', authenticate, async (req, res) => {
  try {
    const notification = await NotificationService.acceptInvitation(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Verify that the invitation is for the current user
    if (notification.toUserId !== req.user.firebaseUid) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Add user to room participants if it's a room invite
    if (notification.type === 'room_invite' && notification.roomId) {
      try {
        // Access Realtime Database
        const realtimeDb = admin.database();
        const roomRef = realtimeDb.ref(`chatrooms/${notification.roomId}`);
        const roomSnapshot = await roomRef.get();

        if (roomSnapshot.exists()) {
          const room = roomSnapshot.val();
          const currentParticipants = room.participants || [];
          
          // Add user if not already a participant
          if (!currentParticipants.includes(req.user.firebaseUid)) {
            currentParticipants.push(req.user.firebaseUid);
            await roomRef.update({
              participants: currentParticipants
            });
          }
        }
      } catch (dbError) {
        console.error('Error updating room participants:', dbError);
        // Don't fail the request if room update fails
      }
    }

    res.json({
      success: true,
      message: 'Invitation accepted',
      data: notification,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept invitation',
      error: error.message,
    });
  }
});

// Reject an invitation
router.post('/:notificationId/reject', authenticate, async (req, res) => {
  try {
    const notification = await NotificationService.rejectInvitation(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Verify that the invitation is for the current user
    if (notification.toUserId !== req.user.firebaseUid) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    res.json({
      success: true,
      message: 'Invitation rejected',
      data: notification,
    });
  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject invitation',
      error: error.message,
    });
  }
});

// Delete a notification
router.delete('/:notificationId', authenticate, async (req, res) => {
  try {
    const notificationRef = db.collection('notifications').doc(req.params.notificationId);
    const doc = await notificationRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Verify ownership
    const notificationData = doc.data();
    if (notificationData.toUserId !== req.user.firebaseUid && notificationData.fromUserId !== req.user.firebaseUid) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    await NotificationService.delete(req.params.notificationId);

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message,
    });
  }
});

export default router;
