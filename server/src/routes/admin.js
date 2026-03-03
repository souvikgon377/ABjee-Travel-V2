import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import userService from '../models/User.js';
import subscriptionService from '../models/Subscription.js';
import { db } from '../config/database.js';
import { realtimeDb } from '../config/firebase-admin.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// @route   GET /api/admin/stats
// @desc    Get dashboard statistics
// @access  Admin only
router.get('/stats', async (req, res) => {
  try {
    // Get total users count
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;

    // Get active users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsersSnapshot = await db.collection('users')
      .where('lastSeen', '>', thirtyDaysAgo)
      .get();
    const activeUsers = activeUsersSnapshot.size;

    // Get subscriptions data
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    const subscriptions = subscriptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const activeSubscriptions = subscriptions.filter(sub => {
      if (!sub.expiresAt) return false;
      return new Date(sub.expiresAt.toDate()) > new Date();
    });

    // Calculate revenue (mock calculation for demo)
    const revenue = {
      total: activeSubscriptions.reduce((sum, sub) => {
        const prices = { basic: 9.99, pro: 19.99, premium: 29.99 };
        return sum + (prices[sub.type] || 0);
      }, 0),
      monthly: activeSubscriptions.filter(sub => {
        const createdAt = sub.createdAt?.toDate() || new Date(0);
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        return createdAt >= thisMonth;
      }).reduce((sum, sub) => {
        const prices = { basic: 9.99, pro: 19.99, premium: 29.99 };
        return sum + (prices[sub.type] || 0);
      }, 0)
    };

    // Get page views (mock data for demo)
    const pageViews = Math.floor(Math.random() * 50000) + 30000;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        revenue: revenue.total,
        monthlyRevenue: revenue.monthly,
        pageViews,
        activeSubscriptions: activeSubscriptions.length,
        stats: {
          users: {
            total: totalUsers,
            active: activeUsers,
            growth: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : '0'
          },
          revenue: {
            total: revenue.total.toFixed(2),
            monthly: revenue.monthly.toFixed(2),
            growth: revenue.total > 0 ? ((revenue.monthly / revenue.total) * 100).toFixed(1) : '0'
          },
          subscriptions: {
            total: activeSubscriptions.length,
            basic: activeSubscriptions.filter(s => s.type === 'basic').length,
            pro: activeSubscriptions.filter(s => s.type === 'pro').length,
            premium: activeSubscriptions.filter(s => s.type === 'premium').length
          }
        }
      }
    });

  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard statistics'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users with filters
// @access  Admin only
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, status } = req.query;
    
    let query = db.collection('users');

    // Apply filters
    if (role && role !== 'all') {
      query = query.where('role', '==', role);
    }

    if (status === 'active') {
      query = query.where('isActive', '==', true);
    } else if (status === 'inactive') {
      query = query.where('isActive', '==', false);
    }

    const snapshot = await query.get();
    let users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      phoneNumber: doc.data().phone, // Map phone to phoneNumber for client compatibility
      createdAt: doc.data().createdAt?.toDate?.() || null,
      lastSeen: doc.data().lastSeen?.toDate?.() || null
    }));

    // Apply search filter (client-side filtering)
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user => 
        user.email?.toLowerCase().includes(searchLower) ||
        user.displayName?.toLowerCase().includes(searchLower) ||
        user.username?.toLowerCase().includes(searchLower)
      );
    }

    // Pagination
    const total = users.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    });
  }
});

// @route   POST /api/admin/users
// @desc    Create new user
// @access  Admin only
router.post('/users', async (req, res) => {
  try {
    const { email, displayName, role = 'user', city, phoneNumber } = req.body;

    // Validate required fields
    if (!email || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Email and display name are required'
      });
    }

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Validate role
    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    // Create user document
    const userRef = db.collection('users').doc();
    const userData = {
      email,
      displayName,
      role,
      city: city || '',
      phone: phoneNumber || '', // Map phoneNumber to phone
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeen: new Date(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`
    };

    await userRef.set(userData);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: {
          id: userRef.id,
          ...userData,
          phoneNumber: userData.phone // Return as phoneNumber for client
        }
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// @route   GET /api/admin/users/:userId
// @desc    Get single user details
// @access  Admin only
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await userService.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
});

// @route   GET /api/admin/users/:userId/activity
// @desc    Get user activity log
// @access  Admin only
router.get('/users/:userId/activity', async (req, res) => {
  try {
    const user = await userService.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Mock activity data - in production, this would come from an activity log collection
    const activities = [
      {
        id: '1',
        type: 'account_created',
        description: 'Account created',
        timestamp: user.createdAt || new Date(),
        metadata: { source: 'admin_panel' }
      },
      {
        id: '2',
        type: 'profile_updated',
        description: 'Profile information updated',
        timestamp: user.updatedAt || new Date(),
        metadata: { fields: ['displayName', 'city'] }
      }
    ];

    // Add last seen activity if available
    if (user.lastSeen) {
      activities.push({
        id: '3',
        type: 'last_seen',
        description: 'Last active on platform',
        timestamp: user.lastSeen,
        metadata: {}
      });
    }

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: {
        activities
      }
    });

  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user activity'
    });
  }
});

// @route   PUT /api/admin/users/:userId
// @desc    Update user (including role)
// @access  Admin only
router.put('/users/:userId', async (req, res) => {
  try {
    const { 
      role, 
      isActive, 
      subscription, 
      displayName, 
      city, 
      phoneNumber, 
      email 
    } = req.body;
    const updates = {};

    if (role !== undefined) {
      if (!['user', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }
      updates.role = role;
    }

    if (isActive !== undefined) {
      updates.isActive = isActive;
    }

    if (subscription !== undefined) {
      updates.subscription = subscription;
    }

    if (displayName !== undefined) {
      updates.displayName = displayName;
    }

    if (city !== undefined) {
      updates.city = city;
    }

    if (phoneNumber !== undefined) {
      updates.phone = phoneNumber;
    }

    if (email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
      updates.email = email.toLowerCase();
    }

    const user = await userService.update(req.params.userId, updates);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// @route   DELETE /api/admin/users/:userId
// @desc    Delete user
// @access  Admin only
router.delete('/users/:userId', async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    await userService.delete(req.params.userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// @route   GET /api/admin/subscriptions
// @desc    Get all subscriptions
// @access  Admin only
router.get('/subscriptions', async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;
    
    let query = db.collection('subscriptions');

    if (type && type !== 'all') {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();
    let subscriptions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      expiresAt: doc.data().expiresAt?.toDate?.() || null,
      canceledAt: doc.data().canceledAt?.toDate?.() || null
    }));

    // Filter by status
    if (status === 'active') {
      const now = new Date();
      subscriptions = subscriptions.filter(sub => {
        return sub.expiresAt && new Date(sub.expiresAt) > now && !sub.canceledAt;
      });
    } else if (status === 'expired') {
      const now = new Date();
      subscriptions = subscriptions.filter(sub => {
        return sub.expiresAt && new Date(sub.expiresAt) <= now;
      });
    } else if (status === 'canceled') {
      subscriptions = subscriptions.filter(sub => sub.canceledAt);
    }

    // Pagination
    const total = subscriptions.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedSubs = subscriptions.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        subscriptions: paginatedSubs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscriptions'
    });
  }
});

// @route   GET /api/admin/activity
// @desc    Get recent activity logs
// @access  Admin only
router.get('/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get recent users
    const recentUsersSnapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .get();

    const activities = recentUsersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: 'user_registered',
        user: data.email || data.username || 'Unknown',
        description: `New user registered: ${data.displayName || data.email}`,
        timestamp: data.createdAt?.toDate?.() || new Date(),
        metadata: {
          userId: doc.id,
          role: data.role
        }
      };
    });

    // Sort by timestamp
    activities.sort((a, b) => b.timestamp - a.timestamp);

    res.json({
      success: true,
      data: {
        activities: activities.slice(0, parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs'
    });
  }
});

// @route   GET /api/admin/revenue
// @desc    Get revenue data for charts
// @access  Admin only
router.get('/revenue', async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    // Get all subscriptions
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    const subscriptions = subscriptionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date()
    }));

    // Generate revenue data based on period
    const prices = { basic: 9.99, pro: 19.99, premium: 29.99 };
    const revenueData = [];

    if (period === 'month') {
      // Last 12 months
      for (let i = 11; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        const monthSubs = subscriptions.filter(sub => {
          const createdAt = new Date(sub.createdAt);
          return createdAt >= monthStart && createdAt <= monthEnd;
        });

        const revenue = monthSubs.reduce((sum, sub) => sum + (prices[sub.type] || 0), 0);

        revenueData.push({
          date: monthStart.toISOString().split('T')[0],
          month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          revenue: parseFloat(revenue.toFixed(2)),
          subscriptions: monthSubs.length
        });
      }
    }

    res.json({
      success: true,
      data: {
        revenue: revenueData,
        total: revenueData.reduce((sum, item) => sum + item.revenue, 0),
        period
      }
    });

  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue data'
    });
  }
});

// @route   GET /api/admin/system-status
// @desc    Get system status
// @access  Admin only
router.get('/system-status', async (req, res) => {
  try {
    const status = {
      server: {
        status: 'operational',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      database: {
        status: 'operational',
        connected: true
      },
      api: {
        status: 'operational',
        responseTime: Math.random() * 100 + 50 // Mock response time
      }
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Get system status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system status'
    });
  }
});

// @route   GET /api/admin/chatrooms
// @desc    Get all chat rooms with filters
// @access  Admin only
router.get('/chatrooms', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, status } = req.query;
    
    // Fetch all rooms from Realtime Database
    const roomsRef = realtimeDb.ref('chatrooms');
    const snapshot = await roomsRef.once('value');
    const roomsData = snapshot.val();
    
    if (!roomsData) {
      return res.json({
        success: true,
        data: {
          rooms: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        }
      });
    }

    // Convert to array and add IDs
    let rooms = Object.keys(roomsData).map(id => {
      const room = roomsData[id];
      // Support both participants array (chatService) and members object (admin-created)
      const memberCount =
        Array.isArray(room.participants) ? room.participants.length :
        room.members && typeof room.members === 'object' ? Object.keys(room.members).length : 0;
      const maxMembers = room.maxMembers || 1000;
      // Normalise type: chatService uses isPublic, admin routes use type
      const resolvedType =
        room.type === 'public' || room.type === 'private' || room.type === 'premium'
          ? room.type
          : room.isPublic === false ? 'private' : 'public';
      return {
        id,
        name: room.name || '',
        description: room.description || '',
        type: resolvedType,
        isPublic: room.isPublic !== false,
        destination: room.destination || {},
        isActive: room.isActive !== false,
        maxMembers,
        memberCount,
        capacityPercent: Math.round((memberCount / maxMembers) * 100),
        messageCount: room.messageCount || 0,
        createdAt: room.createdAt || null,
        updatedAt: room.updatedAt || null,
        lastActivity: room.lastActivity || null,
        createdBy: room.createdBy || null,
        // iconImage from chatService rooms
        iconImage: room.iconImage || null,
        backgroundImage: room.backgroundImage || null,
        // legacy avatar field from admin-created rooms
        avatar: room.avatar || room.iconImage?.url || null,
        tags: Array.isArray(room.tags) ? room.tags : [],
        rules: Array.isArray(room.rules) ? room.rules : [],
        subscriptionRequired: room.subscriptionRequired || false,
        lastMessage: room.lastMessage || null,
        inviteToken: room.inviteToken || null,
      };
    });

    // Apply filters
    if (type && type !== 'all') {
      rooms = rooms.filter(room => room.type === type);
    }

    if (status === 'active') {
      rooms = rooms.filter(room => room.isActive === true);
    } else if (status === 'inactive') {
      rooms = rooms.filter(room => room.isActive === false);
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      rooms = rooms.filter(room => 
        room.name?.toLowerCase().includes(searchLower) ||
        room.description?.toLowerCase().includes(searchLower) ||
        room.destination?.country?.toLowerCase().includes(searchLower) ||
        room.destination?.city?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by createdAt descending
    rooms.sort((a, b) => {
      const dateA = new Date(b.createdAt || 0).getTime();
      const dateB = new Date(a.createdAt || 0).getTime();
      return dateA - dateB;
    });

    // Pagination
    const total = rooms.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedRooms = rooms.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        rooms: paginatedRooms,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get chat rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat rooms'
    });
  }
});

// @route   POST /api/admin/chatrooms
// @desc    Create new chat room
// @access  Admin only
router.post('/chatrooms', async (req, res) => {
  try {
    const { name, description, type = 'public', destination, maxMembers = 1000 } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required'
      });
    }

    // Validate type
    if (!['public', 'private', 'premium'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room type'
      });
    }

    // Check if room name already exists
    const roomsRef = realtimeDb.ref('chatrooms');
    const snapshot = await roomsRef.orderByChild('name').equalTo(name).once('value');
    
    if (snapshot.exists()) {
      return res.status(400).json({
        success: false,
        message: 'A room with this name already exists'
      });
    }

    // Create room in Realtime Database
    const newRoomRef = roomsRef.push();
    const roomData = {
      name,
      description: description || '',
      type,
      destination: destination || { country: null, city: null, region: null },
      isActive: true,
      maxMembers: parseInt(maxMembers) || 1000,
      members: {},
      createdBy: req.user.id,
      subscriptionRequired: type === 'premium',
      messageCount: 0,
      lastActivity: new Date().toISOString(),
      lastMessage: null,
      avatar: null,
      tags: [],
      rules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await newRoomRef.set(roomData);

    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      data: {
        room: {
          id: newRoomRef.key,
          ...roomData,
          memberCount: 0
        }
      }
    });

  } catch (error) {
    console.error('Create chat room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat room'
    });
  }
});

// @route   GET /api/admin/chatrooms/:roomId
// @desc    Get chat room by ID
// @access  Admin only
router.get('/chatrooms/:roomId', async (req, res) => {
  try {
    const roomRef = realtimeDb.ref(`chatrooms/${req.params.roomId}`);
    const snapshot = await roomRef.once('value');
    const data = snapshot.val();

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    const room = {
      id: req.params.roomId,
      ...data,
      memberCount: data.members ? Object.keys(data.members).length : 0
    };

    res.json({
      success: true,
      data: { room }
    });

  } catch (error) {
    console.error('Get chat room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat room'
    });
  }
});

// @route   PUT /api/admin/chatrooms/:roomId
// @desc    Update chat room
// @access  Admin only
router.put('/chatrooms/:roomId', async (req, res) => {
  try {
    const roomRef = realtimeDb.ref(`chatrooms/${req.params.roomId}`);
    const snapshot = await roomRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    const allowedUpdates = ['name', 'description', 'type', 'destination', 'isActive', 'maxMembers'];
    const updates = {};
    
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updates.updatedAt = new Date().toISOString();

    await roomRef.update(updates);

    // Get updated room
    const updatedSnapshot = await roomRef.once('value');
    const data = updatedSnapshot.val();
    const room = {
      id: req.params.roomId,
      ...data,
      memberCount: data.members ? Object.keys(data.members).length : 0
    };

    res.json({
      success: true,
      message: 'Chat room updated successfully',
      data: { room }
    });

  } catch (error) {
    console.error('Update chat room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chat room'
    });
  }
});

// @route   DELETE /api/admin/chatrooms/:roomId
// @desc    Delete chat room
// @access  Admin only
router.delete('/chatrooms/:roomId', async (req, res) => {
  try {
    const roomRef = realtimeDb.ref(`chatrooms/${req.params.roomId}`);
    const snapshot = await roomRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Delete all messages in the room from Realtime Database
    const messagesRef = realtimeDb.ref(`messages`);
    const messagesSnapshot = await messagesRef.orderByChild('roomId').equalTo(req.params.roomId).once('value');
    
    if (messagesSnapshot.exists()) {
      const updates = {};
      messagesSnapshot.forEach(child => {
        updates[child.key] = null;
      });
      await messagesRef.update(updates);
    }

    // Delete the room
    await roomRef.remove();

    res.json({
      success: true,
      message: 'Chat room deleted successfully'
    });

  } catch (error) {
    console.error('Delete chat room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat room'
    });
  }
});

// @route   GET /api/admin/chatrooms/:roomId/members
// @desc    Get chat room members
// @access  Admin only
router.get('/chatrooms/:roomId/members', async (req, res) => {
  try {
    const roomRef = realtimeDb.ref(`chatrooms/${req.params.roomId}`);
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    const members = room.members || {};
    const memberIds = Object.keys(members);

    // Get user details for each member
    const memberDetails = await Promise.all(
      memberIds.map(async (userId) => {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return {
            id: userDoc.id,
            displayName: userData.displayName,
            email: userData.email,
            avatar: userData.avatar,
            role: members[userId].role || 'member',
            joinedAt: members[userId].joinedAt || null
          };
        }
        return null;
      })
    );

    res.json({
      success: true,
      data: {
        members: memberDetails.filter(m => m !== null)
      }
    });

  } catch (error) {
    console.error('Get room members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get room members'
    });
  }
});

export default router;
