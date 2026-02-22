/**
 * 🔥 OPTIMIZED FIREBASE REALTIME DATABASE CHAT SERVICE
 */

import { 
  ref, 
  push, 
  onChildAdded,
  onChildChanged,
  onValue,
  set, 
  remove, 
  get,
  query,
  orderByChild,
  limitToLast,
  endBefore,
  limitToFirst,
  onDisconnect,
  update
} from 'firebase/database';
import { database, auth } from './firebase';

// ==================== INTERFACES ====================

export interface MessageAttachment {
  type: 'image' | 'document' | 'voice' | 'video' | 'audio';
  url: string;
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
  duration?: number; // For audio/video in seconds
}

export interface ChatMessage {
  id?: string;
  roomId: string;
  userId: string;
  username: string;
  photoURL?: string;
  text: string;
  timestamp: number;
  edited?: boolean;
  editedAt?: number;
  deletedForEveryone?: boolean;
  deletedBy?: string[]; // Array of userIds who deleted this message for themselves
  attachment?: MessageAttachment;
}

export interface ChatRoomImage {
  url: string;
  publicId: string;
  hash: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  createdAt: string;
}

export interface ChatRoom {
  id?: string;
  name: string;
  description?: string;
  type: 'group';
  isPublic: boolean; // Public rooms don't require password
  participants: string[];
  createdBy: string;
  createdAt: number;
  password?: string; // Only for private rooms
  inviteToken?: string;
  backgroundImage?: ChatRoomImage;
  iconImage?: ChatRoomImage;
  backgroundImageHistory?: ChatRoomImage[];
  iconImageHistory?: ChatRoomImage[];
  lastMessage?: {
    text: string;
    timestamp: number;
    userId: string;
  };
}

export interface UserStatus {
  uid: string;
  username: string;
  online: boolean;
  lastSeen: number;
}

export interface TypingIndicator {
  userId: string;
  username: string;
  timestamp: number;
}

// ==================== CHAT SERVICE CLASS ====================

class ChatService {
  
  /**
   * WHY: Get current authenticated user or throw error
   * DECISION: Enforce authentication at service level
   */
  private getCurrentUser() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to use chat');
    }
    return user;
  }

  // ==================== USER PRESENCE ====================
  
  /**
   * WHY: Track user online/offline status and last seen
   * DECISION: Use onDisconnect to automatically mark offline when user leaves
   */
  async setUserOnline(username: string) {
    const user = this.getCurrentUser();
    const statusRef = ref(database, `status/${user.uid}`);
    
    const statusData: UserStatus = {
      uid: user.uid,
      username,
      online: true,
      lastSeen: Date.now()
    };
    
    await set(statusRef, statusData);
    
    // Automatically set offline when disconnected
    const offlineData: UserStatus = {
      uid: user.uid,
      username,
      online: false,
      lastSeen: Date.now() // Will be set to actual disconnect time
    };
    
    onDisconnect(statusRef).set(offlineData);
  }

  /**
   * WHY: Update last seen timestamp
   * DECISION: Call this periodically or on important actions
   */
  async updateLastSeen() {
    const user = this.getCurrentUser();
    const lastSeenRef = ref(database, `status/${user.uid}/lastSeen`);
    await set(lastSeenRef, Date.now());
  }

  /**
   * WHY: Listen to user's online/offline status
   * DECISION: Real-time listener for presence
   */
  listenToUserStatus(userId: string, callback: (status: UserStatus | null) => void) {
    const statusRef = ref(database, `status/${userId}`);
    return onValue(statusRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  // ==================== CHAT ROOMS ====================

  /**
   * WHY: Create a group chat room
   * DECISION: Store in RTDB for consistency, not Firestore
   */
  async createGroupRoom(
    name: string, 
    description: string, 
    isPublic: boolean,
    password: string, 
    participantIds: string[] = [],
    backgroundImage?: ChatRoomImage,
    iconImage?: ChatRoomImage
  ) {
    const user = this.getCurrentUser();
    
    // Check room limit (5 rooms per user)
    const userRoomsCount = await this.getUserCreatedRoomsCount(user.uid);
    if (userRoomsCount >= 5) {
      throw new Error('You have reached the maximum limit of 5 rooms. Please delete a room to create a new one.');
    }
    
    const roomsRef = ref(database, 'chatrooms');
    const newRoomRef = push(roomsRef);
    
    // Remove duplicates and ensure creator is included
    const uniqueParticipants = Array.from(new Set([user.uid, ...participantIds]));
    
    // Generate invite token for shareable link
    const inviteToken = this.generateInviteToken();
    
    const room: Omit<ChatRoom, 'id'> = {
      name,
      description,
      type: 'group',
      isPublic,
      participants: uniqueParticipants,
      createdBy: user.uid,
      createdAt: Date.now(),
      ...(isPublic ? {} : { password }), // Only add password for private rooms
      inviteToken,
      ...(backgroundImage && { 
        backgroundImage,
        backgroundImageHistory: [backgroundImage]
      }),
      ...(iconImage && { 
        iconImage,
        iconImageHistory: [iconImage]
      })
    };
    
    await set(newRoomRef, room);
    return newRoomRef.key;
  }

  /**
   * WHY: Count rooms created by a specific user
   * DECISION: Used to enforce 5-room limit
   */
  async getUserCreatedRoomsCount(userId: string): Promise<number> {
    const roomsRef = ref(database, 'chatrooms');
    const snapshot = await get(roomsRef);
    
    let count = 0;
    snapshot.forEach((childSnapshot) => {
      const room = childSnapshot.val();
      if (room.createdBy === userId) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * WHY: Generate unique invite token for shareable links
   * DECISION: Simple random string that's hard to guess
   */
  private generateInviteToken(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15) + 
           Date.now().toString(36);
  }

  /**
   * Listen to ALL public chat rooms
   */
  listenToUserRooms(callback: (rooms: ChatRoom[]) => void) {
    const user = this.getCurrentUser();
    const roomsRef = ref(database, 'chatrooms');
    
    return onValue(roomsRef, (snapshot) => {
      const rooms: ChatRoom[] = [];
      snapshot.forEach((childSnapshot) => {
        const room = childSnapshot.val() as ChatRoom;
        if (room) {
          rooms.push({ id: childSnapshot.key!, ...room });
        }
      });
      
      rooms.sort((a, b) => 
        (b.lastMessage?.timestamp || b.createdAt) - (a.lastMessage?.timestamp || a.createdAt)
      );
      
      callback(rooms);
    }, (error) => {
      if (import.meta.env.DEV) {
        console.error('Error listening to chat rooms:', error);
        console.error('Make sure Firebase Realtime Database rules are deployed!');
      }
      callback([]); // Return empty array on error
    });
  }

  /**
   * WHY: Get single room details
   */
  async getRoom(roomId: string): Promise<ChatRoom | null> {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) return null;
    
    return {
      id: roomId,
      ...snapshot.val()
    };
  }

  /**
   * WHY: Listen to real-time updates for a specific room
   * DECISION: Useful for seeing icon/background changes instantly
   */
  listenToRoom(roomId: string, callback: (room: ChatRoom | null) => void) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    
    return onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      
      const room: ChatRoom = {
        id: roomId,
        ...snapshot.val()
      };
      
      callback(room);
    }, (error) => {
      if (import.meta.env.DEV) {
        console.error('Error listening to room:', error);
      }
      callback(null);
    });
  }

  /**
   * WHY: Join a room (add user to participants)
   * DECISION: Auto-join when user opens a public room
   */
  async joinRoom(roomId: string, userId: string, password?: string, inviteToken?: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
    
    if (!snapshot.exists()) {
      throw new Error('Room not found');
    }
    
    const room = snapshot.val();
    const participants = room.participants || [];
    
    // If user is already a participant, allow them in
    if (participants.includes(userId)) {
      return;
    }
    
    // For public rooms, skip password check
    if (!room.isPublic) {
      // For private rooms, check authentication: either valid invite token or correct password
      if (inviteToken) {
        // Validate invite token
        if (room.inviteToken !== inviteToken) {
          throw new Error('Invalid invite link');
        }
      } else {
        // Validate password
        if (!password || room.password !== password) {
          throw new Error('Incorrect password');
        }
      }
    }
    // For public rooms, allow joining without password
    
    // Add user to participants
    participants.push(userId);
    await update(roomRef, { participants });
  }

  /**
   * WHY: Get shareable invite link for a room
   * DECISION: Returns URL with invite token that bypasses password
   */
  getInviteLink(roomId: string, inviteToken: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/chat/room/${roomId}?invite=${inviteToken}`;
  }

  /**
   * WHY: Delete a room
   * DECISION: Only creator can delete their room
   */
  async deleteRoom(roomId: string) {
    const user = this.getCurrentUser();
    const roomRef = ref(database, `chatrooms/${roomId}`);
    
    // Verify ownership
    const snapshot = await get(roomRef);
    if (!snapshot.exists() || snapshot.val().createdBy !== user.uid) {
      throw new Error('Cannot delete room: not the creator');
    }
    
    await remove(roomRef);
  }

  /**
   * WHY: Update room images (background and/or icon)
   * DECISION: Only creator can update room images
   */
  async updateRoomImages(
    roomId: string, 
    backgroundImage?: ChatRoomImage, 
    iconImage?: ChatRoomImage
  ) {
    const user = this.getCurrentUser();
    const roomRef = ref(database, `chatrooms/${roomId}`);
    
    // Verify ownership
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error('Room not found');
    }
    
    const room = snapshot.val();
    if (room.createdBy !== user.uid) {
      throw new Error('Cannot update room: not the creator');
    }
    
    // Prepare updates
    const updates: any = {};
    if (backgroundImage) {
      updates.backgroundImage = backgroundImage;
      // Add to history if not already present (check by hash)
      const existingHistory = room.backgroundImageHistory || [];
      const isDuplicate = existingHistory.some((img: ChatRoomImage) => img.hash === backgroundImage.hash);
      if (!isDuplicate) {
        updates.backgroundImageHistory = [...existingHistory, backgroundImage];
      } else {
        // Preserve existing history even when selecting from history
        updates.backgroundImageHistory = existingHistory;
      }
    }
    if (iconImage) {
      updates.iconImage = iconImage;
      // Add to history if not already present (check by hash)
      const existingHistory = room.iconImageHistory || [];
      const isDuplicate = existingHistory.some((img: ChatRoomImage) => img.hash === iconImage.hash);
      if (!isDuplicate) {
        updates.iconImageHistory = [...existingHistory, iconImage];
      } else {
        // Preserve existing history even when selecting from history
        updates.iconImageHistory = existingHistory;
      }
    }
    
    // Update the room
    await update(roomRef, updates);
  }

  // ==================== MESSAGES ====================

  /**
   * Send a message to a chat room
   */
  async sendMessage(roomId: string, text: string, attachment?: MessageAttachment) {
    const user = this.getCurrentUser();
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message: ChatMessage = {
      roomId,
      userId: user.uid,
      username: user.displayName || 'Anonymous',
      photoURL: user.photoURL || undefined,
      text,
      timestamp: Date.now(),
      ...(attachment && { attachment })
    };
    
    // Write message
    await set(newMessageRef, message);
    
    // Update room's last message
    const roomRef = ref(database, `chatrooms/${roomId}/lastMessage`);
    const lastMessageText = attachment 
      ? `📎 ${attachment.type === 'voice' ? 'Voice message' : attachment.name}`
      : text.substring(0, 100);
    
    await set(roomRef, {
      text: lastMessageText,
      timestamp: Date.now(),
      userId: user.uid
    });
    
    // Update last seen
    await this.updateLastSeen();
    
    return newMessageRef.key;
  }

  /**
   * WHY: Listen to new messages efficiently
   * DECISION: Use onChildAdded for incremental loading (only new messages)
   * This is much better than onValue which re-downloads everything
   */
  listenToMessages(
    roomId: string, 
    callback: (message: ChatMessage) => void,
    limit: number = 50
  ) {
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const messagesQuery = query(
      messagesRef, 
      orderByChild('timestamp'),
      limitToLast(limit)
    );
    
    // onChildAdded fires for each existing message, then only for new ones
    return onChildAdded(messagesQuery, (snapshot) => {
      const message: ChatMessage = {
        id: snapshot.key!,
        ...snapshot.val()
      };
      callback(message);
    }, (error) => {
      if (import.meta.env.DEV) {
        console.error('PERMISSION_DENIED: Check Firebase RTDB rules are deployed');
      }
    });
  }

  /**
   * WHY: Listen to message updates (edits, deletions)
   * DECISION: Use onChildChanged to detect when messages are modified
   */
  listenToMessageUpdates(
    roomId: string,
    callback: (message: ChatMessage) => void
  ) {
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    
    return onChildChanged(messagesRef, (snapshot) => {
      const message: ChatMessage = {
        id: snapshot.key!,
        ...snapshot.val()
      };
      callback(message);
    });
  }

  /**
   * WHY: Load initial message history
   * DECISION: Use onValue once for history, then switch to onChildAdded for new messages
   */
  async loadMessageHistory(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const messagesQuery = query(
      messagesRef,
      orderByChild('timestamp'),
      limitToLast(limit)
    );
    
    const snapshot = await get(messagesQuery);
    const messages: ChatMessage[] = [];
    
    snapshot.forEach((childSnapshot) => {
      messages.push({
        id: childSnapshot.key!,
        ...childSnapshot.val()
      });
    });
    
    return messages;
  }

  /**
   * WHY: Load previous messages for pagination
   * DECISION: Load messages before the oldest timestamp
   */
  async loadPreviousMessages(roomId: string, beforeTimestamp: number, limit: number = 50): Promise<ChatMessage[]> {
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const messagesQuery = query(
      messagesRef,
      orderByChild('timestamp'),
      endBefore(beforeTimestamp),
      limitToLast(limit)
    );
    
    const snapshot = await get(messagesQuery);
    const messages: ChatMessage[] = [];
    
    snapshot.forEach((childSnapshot) => {
      messages.push({
        id: childSnapshot.key!,
        ...childSnapshot.val()
      });
    });
    
    return messages;
  }

  /**
   * WHY: Edit a message
   * DECISION: Mark as edited with timestamp
   */
  async editMessage(roomId: string, messageId: string, newText: string) {
    const user = this.getCurrentUser();
    const messageRef = ref(database, `chatrooms/${roomId}/messages/${messageId}`);
    
    // Verify ownership
    const snapshot = await get(messageRef);
    if (!snapshot.exists() || snapshot.val().userId !== user.uid) {
      throw new Error('Cannot edit message: not owner');
    }
    
    await update(messageRef, {
      text: newText,
      edited: true,
      editedAt: Date.now()
    });
  }

  /**
   * WHY: Delete message for current user only (WhatsApp "Delete for me")
   * DECISION: Add user to deletedBy array, message still exists for others
   */
  async deleteMessageForMe(roomId: string, messageId: string) {
    const user = this.getCurrentUser();
    const messageRef = ref(database, `chatrooms/${roomId}/messages/${messageId}`);
    
    const snapshot = await get(messageRef);
    if (!snapshot.exists()) {
      throw new Error('Message not found');
    }
    
    const message = snapshot.val();
    const deletedBy = message.deletedBy || [];
    
    // Add current user to deletedBy array if not already there
    if (!deletedBy.includes(user.uid)) {
      deletedBy.push(user.uid);
      await update(messageRef, { deletedBy });
    }
  }

  /**
   * WHY: Delete message for everyone (WhatsApp "Delete for everyone")
   * DECISION: Only message owner can delete for everyone, marks message as deleted
   */
  async deleteMessageForEveryone(roomId: string, messageId: string) {
    const user = this.getCurrentUser();
    const messageRef = ref(database, `chatrooms/${roomId}/messages/${messageId}`);
    
    // Verify ownership
    const snapshot = await get(messageRef);
    if (!snapshot.exists()) {
      throw new Error('Message not found');
    }
    
    const message = snapshot.val();
    if (message.userId !== user.uid) {
      throw new Error('Only the sender can delete this message for everyone');
    }
    
    // Mark as deleted for everyone
    await update(messageRef, {
      deletedForEveryone: true,
      text: 'This message was deleted',
      deletedAt: Date.now()
    });
  }

  /**
   * WHY: Delete a message (legacy - kept for backwards compatibility)
   * DECISION: Only message owner can delete
   */
  async deleteMessage(roomId: string, messageId: string) {
    await this.deleteMessageForEveryone(roomId, messageId);
  }

  // ==================== TYPING INDICATORS ====================

  /**
   * WHY: Show typing indicator
   * DECISION: Auto-remove after 3 seconds
   */
  async startTyping(roomId: string) {
    const user = this.getCurrentUser();
    const typingRef = ref(database, `typing/${roomId}/${user.uid}`);
    
    await set(typingRef, {
      userId: user.uid,
      username: user.displayName || 'Anonymous',
      timestamp: Date.now()
    });
  }

  /**
   * WHY: Hide typing indicator
   */
  async stopTyping(roomId: string) {
    const user = this.getCurrentUser();
    const typingRef = ref(database, `typing/${roomId}/${user.uid}`);
    await remove(typingRef);
  }

  /**
   * WHY: Listen to who's typing
   * DECISION: Filter out current user
   */
  listenToTyping(roomId: string, callback: (users: TypingIndicator[]) => void) {
    const user = this.getCurrentUser();
    const typingRef = ref(database, `typing/${roomId}`);
    
    return onValue(typingRef, (snapshot) => {
      const typingUsers: TypingIndicator[] = [];
      const now = Date.now();
      
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        // Filter out stale typing indicators (>5 seconds old)
        if (data.userId !== user.uid && now - data.timestamp < 5000) {
          typingUsers.push(data);
        }
      });
      
      callback(typingUsers);
    });
  }
}

// Export singleton instance
export const chatService = new ChatService();
