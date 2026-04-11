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
  onDisconnect,
  update
} from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { database, auth } from './firebase';
import { firestoreDb } from './firebaseFirestore';
import { getPrivateRoomParticipationAllowance } from './subscriptionPolicy';

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
  visibility?: 'exposed' | 'private'; // Only for private rooms: exposed = visible to all, private = hidden
  participants: string[];
  createdBy: string;
  createdAt: number;
  password?: string; // Only for private rooms
  inviteToken?: string;
  pendingInvites?: string[]; // User IDs pending invitation acceptance for private rooms
  joinRequests?: string[]; // User IDs who requested to join (for exposed private rooms)
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
  private readonly emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  private readonly urlRegex = /\b((https?:\/\/|www\.)[^\s]+|[a-z0-9-]+\.(com|net|org|in|co|io|app|dev|me|ly|ai|info|biz|edu|gov)(\/[^\s]*)?)\b/i;
  private readonly phoneRegex = /(?:\+?\d[\d\s().-]{8,}\d)/;

  private hasRestrictedPublicContent(text: string): boolean {
    if (!text) return false;
    return (
      this.emailRegex.test(text) ||
      this.urlRegex.test(text) ||
      this.phoneRegex.test(text)
    );
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'object') {
      const candidate = value as { seconds?: unknown; toDate?: () => Date };
      if (typeof candidate.toDate === 'function') {
        const parsed = candidate.toDate();
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      if (typeof candidate.seconds === 'number') {
        const parsed = new Date(candidate.seconds * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }

    return null;
  }

  private async getUserImageLimitPerDay(userId: string): Promise<number> {
    const userRef = doc(firestoreDb, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return 5;
    }

    const data = userSnap.data() as Record<string, unknown>;
    const subscription = (data.subscription ?? {}) as Record<string, unknown>;
    const type = typeof subscription.type === 'string' ? subscription.type.toLowerCase() : 'free';
    const isActive = Boolean(subscription.isActive);
    const interval = subscription.interval === 'yearly' ? 'yearly' : 'monthly';
    const endDate = this.parseDate(subscription.endDate);
    const hasPaid = isActive && type !== 'free' && (!endDate || endDate.getTime() > Date.now());

    if (hasPaid) {
      return interval === 'yearly' ? 200 : 50;
    }

    const createdAt = this.parseDate(data.createdAt);
    if (createdAt) {
      const elapsedMs = Date.now() - createdAt.getTime();
      const trialMs = 7 * 24 * 60 * 60 * 1000;
      if (elapsedMs <= trialMs) {
        return 50;
      }
    }

    return 5;
  }

  private async enforcePublicRoomImagePolicy(roomId: string, attachment?: MessageAttachment): Promise<void> {
    if (!attachment || attachment.type !== 'image') return;

    const roomRef = ref(database, `chatrooms/${roomId}`);
    const roomSnapshot = await get(roomRef);
    if (!roomSnapshot.exists()) {
      throw new Error('Community not found');
    }

    const room = roomSnapshot.val() as ChatRoom;
    if (!room.isPublic) return;

    if (attachment.size > 1024 * 1024) {
      throw new Error('Image size must be 1MB or less for public communities.');
    }

    const user = this.getCurrentUser();
    const dailyLimit = await this.getUserImageLimitPerDay(user.uid);

    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const messageSnapshot = await get(messagesRef);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartTs = dayStart.getTime();

    let imageCountToday = 0;
    if (messageSnapshot.exists()) {
      messageSnapshot.forEach((child) => {
        const msg = child.val() as ChatMessage;
        const isOwn = msg.userId === user.uid;
        const isToday = typeof msg.timestamp === 'number' && msg.timestamp >= dayStartTs;
        const isImage = msg.attachment?.type === 'image';
        if (isOwn && isToday && isImage) {
          imageCountToday += 1;
        }
      });
    }

    if (imageCountToday >= dailyLimit) {
      throw new Error(`Daily image limit reached for public communities (${dailyLimit}/day).`);
    }
  }

  private async enforcePublicRoomContentPolicy(roomId: string, text: string): Promise<void> {
    if (!text.trim()) return;

    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }

    const room = snapshot.val() as ChatRoom;
    if (!room.isPublic) return;

    if (this.hasRestrictedPublicContent(text)) {
      throw new Error('In public communities, phone numbers, email addresses, and links are not allowed.');
    }
  }
  
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

  private async isAdminOrOwner(userId: string): Promise<boolean> {
    const userRef = doc(firestoreDb, 'users', userId);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) return false;

    const roleRaw = (userSnapshot.data() as Record<string, unknown>).role;
    const role = typeof roleRaw === 'string' ? roleRaw.toLowerCase() : '';
    return role === 'admin' || role === 'owner';
  }

  private async assertAdminOrOwner(userId: string, message: string): Promise<void> {
    const isAdmin = await this.isAdminOrOwner(userId);
    if (!isAdmin) {
      throw new Error(message);
    }
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

  // ==================== CHAT COMMUNITIES ====================

  /**
   * WHY: Create a group chat community
   * DECISION: Store in RTDB for consistency, not Firestore
   */
  async createGroupRoom(
    name: string, 
    description: string, 
    isPublic: boolean,
    password: string,
    participantIds: string[] = [],
    backgroundImage?: ChatRoomImage,
    iconImage?: ChatRoomImage,
    visibility?: 'exposed' | 'private',
    options?: { maxPrivateRooms?: number }
  ) {
    const user = this.getCurrentUser();

    await this.assertAdminOrOwner(user.uid, 'Only admins can create community chat.');

    if (!isPublic) {
      await this.enforcePrivateRoomMembershipLimit(user.uid, options?.maxPrivateRooms);
    }
    
    const roomsRef = ref(database, 'chatrooms');
    const newRoomRef = push(roomsRef);
    
    // For private rooms: only creator is initial participant
    // For public rooms: include all selected participants
    const participants = isPublic 
      ? Array.from(new Set([user.uid, ...participantIds]))
      : [user.uid];
    
    // Generate invite token for shareable link
    const inviteToken = this.generateInviteToken();
    
    const room: Omit<ChatRoom, 'id'> = {
      name,
      description,
      type: 'group',
      isPublic,
      ...(!isPublic && visibility && { visibility }), // Only add visibility for private rooms
      participants,
      createdBy: user.uid,
      createdAt: Date.now(),
      ...(isPublic ? {} : {}), // Private rooms are access-controlled without password
      inviteToken,
      pendingInvites: !isPublic ? participantIds : [], // Store pending invites for private rooms
      ...(!isPublic && visibility === 'exposed' && { joinRequests: [] }), // Initialize join requests for exposed rooms
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
    const stats = await this.getUserCreatedRoomStats(userId);
    return stats.total;
  }

  /**
   * WHY: Count public/private rooms created by a specific user
   * DECISION: Needed for plan-aware private room limits and trial checks
   */
  async getUserCreatedRoomStats(userId: string): Promise<{ total: number; public: number; private: number }> {
    const roomsRef = ref(database, 'chatrooms');
    const snapshot = await get(roomsRef);

    let total = 0;
    let publicCount = 0;
    let privateCount = 0;

    snapshot.forEach((childSnapshot) => {
      const room = childSnapshot.val();
      if (room.createdBy === userId) {
        total++;
        if (room.isPublic) publicCount++;
        else privateCount++;
      }
    });

    return {
      total,
      public: publicCount,
      private: privateCount,
    };
  }

  /**
   * WHY: Count private rooms where user is a participant
   * DECISION: Used for create-or-join private room caps
   */
  async getUserPrivateRoomMembershipCount(userId: string): Promise<number> {
    const roomsRef = ref(database, 'chatrooms');
    const snapshot = await get(roomsRef);

    let privateRoomCount = 0;

    snapshot.forEach((childSnapshot) => {
      const room = childSnapshot.val() as ChatRoom;
      if (room?.isPublic) return;

      const participants = room.participants || [];
      const isParticipant = participants.includes(userId) || room.createdBy === userId;
      if (isParticipant) {
        privateRoomCount += 1;
      }
    });

    return privateRoomCount;
  }

  private async enforcePrivateRoomMembershipLimit(userId: string, maxOverride?: number): Promise<void> {
    const privateRoomCount = await this.getUserPrivateRoomMembershipCount(userId);

    if (typeof maxOverride === 'number' && maxOverride >= 0 && privateRoomCount >= maxOverride) {
      throw new Error(`You have reached your private community limit (${maxOverride}).`);
    }

    const userRef = doc(firestoreDb, 'users', userId);
    const userSnapshot = await getDoc(userRef);
    const userProfile = userSnapshot.exists() ? userSnapshot.data() : {};
    const allowance = getPrivateRoomParticipationAllowance(userProfile, privateRoomCount);

    if (!allowance.allowed) {
      throw new Error(allowance.reason);
    }
  }

  private isGeneralCommunityRoom(room: Partial<ChatRoom> | null | undefined): boolean {
    return typeof room?.name === 'string' && room.name.trim().toLowerCase() === 'general community chat';
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
   * Listen to ALL public chat communities
   */
  listenToUserRooms(callback: (rooms: ChatRoom[]) => void) {
    const user = this.getCurrentUser();
    const roomsRef = ref(database, 'chatrooms');
    
    return onValue(roomsRef, (snapshot) => {
      const rooms: ChatRoom[] = [];
      snapshot.forEach((childSnapshot) => {
        const room = childSnapshot.val() as ChatRoom;
        if (room) {
          // Filter rooms based on user access:
          // 1. Public rooms are always visible
          // 2. Private exposed rooms are visible to all users
          // 3. Private private rooms are only visible if user is creator or participant
          const isPublicRoom = room.isPublic === true;
          const isCreator = room.createdBy === user.uid;
          const isParticipant = room.participants?.includes(user.uid) || false;
          const isExposedPrivateRoom = !room.isPublic && room.visibility === 'exposed';
          
          // Only add room if user has access to it
          if (isPublicRoom || isExposedPrivateRoom || isCreator || isParticipant) {
            rooms.push({ id: childSnapshot.key!, ...room });
          }
        }
      });
      
      rooms.sort((a, b) => 
        (b.lastMessage?.timestamp || b.createdAt) - (a.lastMessage?.timestamp || a.createdAt)
      );
      
      callback(rooms);
    }, (error) => {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error listening to chat communities:', error);
        console.error('Make sure Firebase Realtime Database rules are deployed!');
      }
      callback([]); // Return empty array on error
    });
  }

  /**
   * Listen to public chat communities for signed-out visitors.
   */
  listenToPublicRooms(callback: (rooms: ChatRoom[]) => void) {
    const roomsRef = ref(database, 'chatrooms');

    return onValue(roomsRef, (snapshot) => {
      const rooms: ChatRoom[] = [];

      snapshot.forEach((childSnapshot) => {
        const room = childSnapshot.val() as ChatRoom;
        if (room?.isPublic) {
          rooms.push({ id: childSnapshot.key!, ...room });
        }
      });

      rooms.sort((a, b) =>
        (b.lastMessage?.timestamp || b.createdAt) - (a.lastMessage?.timestamp || a.createdAt)
      );

      callback(rooms);
    }, (error) => {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error listening to public chat communities:', error);
      }
      callback([]);
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
      if ((process.env.NODE_ENV === "development")) {
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
      throw new Error('Community not found');
    }
    
    const room = snapshot.val();
    const participants = room.participants || [];
    const generalCommunity = this.isGeneralCommunityRoom(room);
    
    // If user is already a participant, allow them in
    if (participants.includes(userId)) {
      return;
    }
    
    // For public rooms and General Community, skip private-membership checks
    if (!room.isPublic && !generalCommunity) {
      await this.enforcePrivateRoomMembershipLimit(userId);

      // For private rooms, invite token is required unless user is already a participant
      if (inviteToken) {
        // Validate invite token
        if (room.inviteToken !== inviteToken) {
          throw new Error('Invalid invite link');
        }
      } else {
        throw new Error('Private community requires invite or admin approval.');
      }
    }
    // For public rooms, allow joining without password
    
    // Add user to participants
    participants.push(userId);
    await update(roomRef, { participants });
  }

  /**
   * WHY: Allow a member to exit a private community
   * DECISION: Public/community-wide rooms are not modified by this method
   */
  async leaveRoom(roomId: string, userId: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }

    const room = snapshot.val() as ChatRoom;
    const generalCommunity = this.isGeneralCommunityRoom(room);

    // Exit action is only for private communities.
    if (room.isPublic || generalCommunity) {
      return;
    }

    if (room.createdBy === userId) {
      throw new Error('Community creator cannot exit. Delete the community instead.');
    }

    const participants = Array.isArray(room.participants) ? room.participants : [];
    if (!participants.includes(userId)) {
      return;
    }

    const updates: Record<string, unknown> = {
      participants: participants.filter((id) => id !== userId),
    };

    if (Array.isArray(room.pendingInvites)) {
      updates.pendingInvites = room.pendingInvites.filter((id) => id !== userId);
    }

    if (Array.isArray(room.joinRequests)) {
      updates.joinRequests = room.joinRequests.filter((id) => id !== userId);
    }

    await update(roomRef, updates);
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
   * WHY: Request to join an exposed private room
   * DECISION: Adds user to joinRequests array for admin approval
   */
  async requestToJoinRoom(roomId: string, userId: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
  
    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }
  
    const room = snapshot.val();
  
    // Validate room is exposed private room
    if (room.isPublic || room.visibility !== 'exposed') {
      throw new Error('Join requests are only available for exposed private communities');
    }
  
    // Check if user is already a participant
    const participants = room.participants || [];
    if (participants.includes(userId)) {
      throw new Error('You are already a member of this community');
    }
  
    await this.enforcePrivateRoomMembershipLimit(userId);

    // Check if user already requested
    const joinRequests = room.joinRequests || [];
    if (joinRequests.includes(userId)) {
      throw new Error('You have already requested to join this community');
    }
  
    // Add user to join requests
    joinRequests.push(userId);
    await update(roomRef, { joinRequests });
  }

  /**
   * WHY: Accept a join request for an exposed private room
   * DECISION: Only room creator/admin can accept requests
   */
  async acceptJoinRequest(roomId: string, requestUserId: string, adminUserId: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
  
    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }
  
    const room = snapshot.val();
  
    // Check if admin is the creator
    if (room.createdBy !== adminUserId) {
      throw new Error('Only the community creator can accept join requests');
    }
  
    const joinRequests = room.joinRequests || [];
    const participants = room.participants || [];
  
    // Check if request exists
    if (!joinRequests.includes(requestUserId)) {
      throw new Error('Join request not found');
    }
  
    await this.enforcePrivateRoomMembershipLimit(requestUserId);

    // Remove from join requests and add to participants
    const updatedRequests = joinRequests.filter((uid: string) => uid !== requestUserId);
    const updatedParticipants = [...participants, requestUserId];
  
    await update(roomRef, { 
      joinRequests: updatedRequests,
      participants: updatedParticipants 
    });
  }

  /**
   * WHY: Reject a join request for an exposed private room
   * DECISION: Only room creator/admin can reject requests
   */
  async rejectJoinRequest(roomId: string, requestUserId: string, adminUserId: string) {
    const roomRef = ref(database, `chatrooms/${roomId}`);
    const snapshot = await get(roomRef);
  
    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }
  
    const room = snapshot.val();
  
    // Check if admin is the creator
    if (room.createdBy !== adminUserId) {
      throw new Error('Only the community creator can reject join requests');
    }
  
    const joinRequests = room.joinRequests || [];
  
    // Check if request exists
    if (!joinRequests.includes(requestUserId)) {
      throw new Error('Join request not found');
    }
  
    // Remove from join requests
    const updatedRequests = joinRequests.filter((uid: string) => uid !== requestUserId);
  
    await update(roomRef, { joinRequests: updatedRequests });
  }

  /**
   * WHY: Delete a room
   * DECISION: Only creator can delete their room
   */
  async deleteRoom(roomId: string) {
    const user = this.getCurrentUser();
    const roomRef = ref(database, `chatrooms/${roomId}`);
    
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error('Community not found');
    }

    const room = snapshot.val() as ChatRoom;
    if (room.isPublic) {
      await this.assertAdminOrOwner(user.uid, 'Only admins can maintain General Community Chat.');
    } else if (room.createdBy !== user.uid) {
      throw new Error('Cannot delete community: not the creator');
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
      throw new Error('Community not found');
    }
    
    const room = snapshot.val() as ChatRoom;
    if (room.isPublic) {
      await this.assertAdminOrOwner(user.uid, 'Only admins can maintain General Community Chat.');
    } else if (room.createdBy !== user.uid) {
      throw new Error('Cannot update community: not the creator');
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
   * Send a message to a chat community
   */
  async sendMessage(roomId: string, text: string, attachment?: MessageAttachment) {
    const user = this.getCurrentUser();
    const trimmedText = text.trim();
    await this.enforcePublicRoomContentPolicy(roomId, trimmedText);
    await this.enforcePublicRoomImagePolicy(roomId, attachment);

    const messagesRef = ref(database, `chatrooms/${roomId}/messages`);
    const newMessageRef = push(messagesRef);
    
    const message: ChatMessage = {
      roomId,
      userId: user.uid,
      username: user.displayName || 'Anonymous',
      photoURL: user.photoURL || undefined,
      text: trimmedText,
      timestamp: Date.now(),
      ...(attachment && { attachment })
    };
    
    // Write message
    await set(newMessageRef, message);
    
    // Update room's last message
    const roomRef = ref(database, `chatrooms/${roomId}/lastMessage`);
    const lastMessageText = attachment 
      ? `📎 ${attachment.type === 'voice' ? 'Voice message' : attachment.name}`
      : trimmedText.substring(0, 100);
    
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
    }, (_error) => {
      if ((process.env.NODE_ENV === "development")) {
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
    const trimmedText = newText.trim();
    await this.enforcePublicRoomContentPolicy(roomId, trimmedText);

    const messageRef = ref(database, `chatrooms/${roomId}/messages/${messageId}`);
    
    // Verify ownership
    const snapshot = await get(messageRef);
    if (!snapshot.exists() || snapshot.val().userId !== user.uid) {
      throw new Error('Cannot edit message: not owner');
    }
    
    await update(messageRef, {
      text: trimmedText,
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

