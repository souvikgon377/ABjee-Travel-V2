import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import userService from '../models/User.js';
import subscriptionService from '../models/Subscription.js';
import { db } from '../config/database.js';

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

// @route   PUT /api/admin/users/:userId
// @desc    Update user (including role)
// @access  Admin only
router.put('/users/:userId', async (req, res) => {
  try {
    const { role, isActive, subscription } = req.body;
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

export default router;
