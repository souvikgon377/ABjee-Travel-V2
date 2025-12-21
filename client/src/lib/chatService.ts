/**
 * 🔥 OPTIMIZED FIREBASE REALTIME DATABASE CHAT SERVICE
 */

import { 
  ref, 
  push, 
  onChildAdded,
  onValue,
  set, 
  remove, 
  get,
  query,
  orderByChild,
  limitToLast,
  onDisconnect,
  update
} from 'firebase/database';
import { database, auth } from './firebase';

// ==================== INTERFACES ====================

export interface ChatMessage {
  id?: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  edited?: boolean;
  editedAt?: number;
}

export interface ChatRoom {
  id?: string;
  name: string;
  description?: string;
  type: 'group';
  participants: string[];
  createdBy: string;
  createdAt: number;
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
  async createGroupRoom(name: string, description: string, participantIds: string[] = []) {
    const user = this.getCurrentUser();
    const roomsRef = ref(database, 'chatrooms');
    const newRoomRef = push(roomsRef);
    
    // Remove duplicates and ensure creator is included
    const uniqueParticipants = Array.from(new Set([user.uid, ...participantIds]));
    
    const room: Omit<ChatRoom, 'id'> = {
      name,
      description,
      type: 'group',
      participants: uniqueParticipants,
      createdBy: user.uid,
      createdAt: Date.now()
    };
    
    await set(newRoomRef, room);
    return newRoomRef.key;
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
      console.error('Error listening to chat rooms:', error);
      console.error('Make sure Firebase Realtime Database rules are deployed!');
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
   * WHY: Join a room (add user to participants)
   * DECISION: Auto-join when user opens a public room
   */
  async joinRoom(roomId: string, userId: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
    
    if (snapshot.exists()) {
      const room = snapshot.val();
      const participants = room.participants || [];
      
      if (!participants.includes(userId)) {
        participants.push(userId);
        await update(roomRef, { participants });
      }
    }
  }

  // ==================== MESSAGES ====================

  /**
   * Send a message to a chat room
   */
  async sendMessage(roomId: string, text: string) {
    const user = this.getCurrentUser();
    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message: ChatMessage = {
      roomId,
      userId: user.uid,
      username: user.displayName || 'Anonymous',
      text,
      timestamp: Date.now()
    };
    
    // Write message
    await set(newMessageRef, message);
    
    // Update room's last message
    const roomRef = ref(database, `chatrooms/${roomId}/lastMessage`);
    await set(roomRef, {
      text: text.substring(0, 100),
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
   * WHY: Delete a message
   * DECISION: Only message owner can delete
   */
  async deleteMessage(roomId: string, messageId: string) {
    const user = this.getCurrentUser();
    const messageRef = ref(database, `chatrooms/${roomId}/messages/${messageId}`);
    
    // Verify ownership
    const snapshot = await get(messageRef);
    if (!snapshot.exists() || snapshot.val().userId !== user.uid) {
      throw new Error('Cannot delete message: not owner');
    }
    
    await remove(messageRef);
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
