export type UserRole = 'user' | 'moderator' | 'admin';

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  isOnline?: boolean;
  role?: UserRole;
}

export interface Message {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system' | 'travel_request';
  sender: User;
  createdAt: string;
  reactions?: Array<{
    user: User;
    emoji: string;
    createdAt: string;
  }>;
  replyTo?: {
    id: string;
    content: string;
    sender: User;
  };
  isModerated?: boolean;
  moderatedBy?: User;
  moderationReason?: string;
}

export interface RoomData {
  name: string;
  description?: string;
  type: 'public' | 'private' | 'travel_partner';
  destination?: {
    country: string;
    city?: string;
    region?: string;
  };
}

export interface Room extends RoomData {
  id: string;
  creator: User;
  members: User[];
  moderators: User[];
  memberCount: number;
  onlineMembers?: User[];
  isArchived?: boolean;
  lastActivity: string;
  pinnedMessages?: string[];
  bannedUsers?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserEvent {
  user: User;
  roomId: string;
}

export interface MessageEvent {
  messageId: string;
  user: User;
  roomId: string;
}

export interface ModerationEvent extends MessageEvent {
  reason: string;
  moderatedBy?: User;
}

export interface ReactionEvent extends MessageEvent {
  emoji: string;
}

export interface RoomJoinResponse {
  messages: Message[];
  room: Room;
}

// Socket Service Interface
export interface ISocketService {
  connect(token: string, isReconnect?: boolean): Promise<void>;
  disconnect(): void;
  getSocket(): any | null;
  isConnected(): boolean;
  getLastError(): Error | null;
  setTokenRefreshCallback(callback: () => Promise<string>): void;
  
  // Room methods
  joinRoom(roomId: string): Promise<RoomJoinResponse>;
  leaveRoom(roomId: string): Promise<void>;
  sendMessage(roomId: string, content: string, type?: string, replyTo?: string): Promise<any>;
  startTyping(roomId: string): void;
  stopTyping(roomId: string): void;
  addReaction(messageId: string, emoji: string): void;
  getRooms(type?: string, page?: number, limit?: number): Promise<any>;
  
  // Event listeners
  on<K extends string>(event: K, callback: (...args: any[]) => void): void;
  once<K extends string>(event: K, callback: (...args: any[]) => void): void;
  off<K extends string>(event: K, callback?: (...args: any[]) => void): void;
  clearAllListeners(): void;
  
  // Typed event handlers
  onNewMessage(callback: (message: Message) => void): void;
  onUserJoinedRoom(callback: (data: UserEvent) => void): void;
  onUserLeftRoom(callback: (data: UserEvent) => void): void;
  onUserTyping(callback: (data: UserEvent) => void): void;
  onUserStoppedTyping(callback: (data: UserEvent) => void): void;
  onUserStatusChange(callback: (data: { user: User; status: 'online' | 'offline' }) => void): void;
  onReactionAdded(callback: (data: ReactionEvent) => void): void;
  
  // Moderation methods
  deleteMessage(messageId: string): Promise<void>;
  reportMessage(messageId: string, reason: string, description?: string): Promise<void>;
  moderateMessage(messageId: string, reason: string): Promise<void>;
  togglePinMessage(messageId: string): Promise<void>;
  
  // Moderation event handlers
  onMessageDeleted(callback: (data: MessageEvent) => void): void;
  onMessageModerated(callback: (data: ModerationEvent) => void): void;
  onMessagePinToggled(callback: (data: { messageId: string; isPinned: boolean }) => void): void;
  onNewReport(callback: (data: ModerationEvent) => void): void;
}

export interface SocketHandlers {
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;
  error: (error: Error) => void;
  [key: string]: (...args: any[]) => void;
}