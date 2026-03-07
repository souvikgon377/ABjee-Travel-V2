import { db, admin } from '../config/database.js';

const COLLECTION_NAME = 'users';

// Helper function to create user object
const createUserData = (data) => ({
  firebaseUid: data.firebaseUid || null,
  email: data.email || '',
  emailVerified: data.emailVerified || false,
  displayName: data.displayName || '',
  firstName: data.firstName || '',
  lastName: data.lastName || '',
  username: data.username || null,
  address: data.address || '',
  city: data.city || '',
  zipCode: data.zipCode || '',
  avatar: data.avatar || null,
  bio: data.bio || '',
  phone: data.phone || null,
  profileImage: data.profileImage || null,
  role: data.role || 'user',
  travelInterests: data.travelInterests || [],
  preferredDestinations: data.preferredDestinations || [],
  subscription: {
    type: data.subscription?.type || 'free',
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
    theme: data.preferences?.theme || 'light',
  },
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

// User Service Class
class UserService {
  constructor() {
    this.collection = db.collection(COLLECTION_NAME);
  }

  // Create a new user
  async create(userData) {
    const userRef = this.collection.doc();
    const user = createUserData({ ...userData, id: userRef.id });
    await userRef.set(user);
    return { id: userRef.id, ...user };
  }

  // Create user with specific ID (for Firebase UID)
  async createWithId(uid, userData) {
    const userRef = this.collection.doc(uid);
    const user = createUserData({ ...userData, firebaseUid: uid });
    await userRef.set(user);
    return { id: uid, ...user };
  }

  // Find user by ID
  async findById(userId) {
    const doc = await this.collection.doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  // Find user by Firebase UID
  async findByFirebaseUid(firebaseUid) {
    const snapshot = await this.collection
      .where('firebaseUid', '==', firebaseUid)
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Find user by email
  async findByEmail(email) {
    const snapshot = await this.collection
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Find user by username
  async findByUsername(username) {
    const snapshot = await this.collection
      .where('username', '==', username)
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  // Find user by email or username
  async findOne(query) {
    if (query.email) {
      return this.findByEmail(query.email);
    }
    if (query.username) {
      return this.findByUsername(query.username);
    }
    if (query.firebaseUid) {
      return this.findByFirebaseUid(query.firebaseUid);
    }
    return null;
  }

  // Update user
  async update(userId, updateData) {
    const userRef = this.collection.doc(userId);
    const updates = {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await userRef.update(updates);
    return this.findById(userId);
  }

  // Delete user
  async delete(userId) {
    await this.collection.doc(userId).delete();
    return true;
  }

  // Get all users with pagination
  async getAll(options = {}) {
    const { limit = 50, offset = 0 } = options;
    let query = this.collection.orderBy('createdAt', 'desc');
    
    if (limit) query = query.limit(limit);
    if (offset) query = query.offset(offset);
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Find online users
  async findOnlineUsers() {
    const snapshot = await this.collection
      .where('isOnline', '==', true)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Update user status
  async updateStatus(userId, isOnline) {
    return this.update(userId, {
      isOnline,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Add chat room to user
  async addChatRoom(userId, roomId) {
    const userRef = this.collection.doc(userId);
    await userRef.update({
      joinedChatRooms: admin.firestore.FieldValue.arrayUnion(roomId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return this.findById(userId);
  }

  // Remove chat room from user
  async removeChatRoom(userId, roomId) {
    const userRef = this.collection.doc(userId);
    await userRef.update({
      joinedChatRooms: admin.firestore.FieldValue.arrayRemove(roomId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return this.findById(userId);
  }

  // Update user's last active timestamp
async updateLastActive(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    await this.collection.doc(userId).update({
      isOnline: true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating last active:', error);
    throw error;
  }
}

  // Check if user has active subscription
  hasActiveSubscription(user) {
    return user.subscription?.isActive && 
           user.subscription?.endDate && 
           new Date(user.subscription.endDate) > new Date();
  }

  // Check if user can access private chat
  canAccessPrivateChat(user) {
    return this.hasActiveSubscription(user) && 
           ['pro', 'premium'].includes(user.subscription?.type);
  }

  // Get full name
  getFullName(user) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  }
}

// Add this after the class definition, before the export
UserService.prototype.updateLastActive = async function(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    await this.collection.doc(userId).update({
      isOnline: true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating last active:', error);
    throw error;
  }
};

const userService = new UserService();
export default userService;