import express from 'express';
import { body, validationResult } from 'express-validator';
import userService from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', authenticate, async (req, res) => {
  try {
    // req.user is already populated by the authenticate middleware
    const { id, ...userData } = req.user;
    const user = { id, ...userData };
    delete user.password;

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticate, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('travelInterests').optional().isArray(),
  body('preferredDestinations').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const allowedUpdates = [
      'firstName', 'lastName', 'bio', 'travelInterests', 
      'preferredDestinations', 'address', 'city', 'zipCode'
    ];
    
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await userService.update(req.user.id, updates);
    if (user) delete user.password;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/users/search
// @desc    Search users for travel partners
// @access  Private
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q, page = 1, limit = 50 } = req.query;

    // Fetch all active users via userService (Firestore)
    const allUsers = await userService.getAll({ limit: 500 });

    // Exclude current user and inactive users
    let filtered = allUsers.filter(u =>
      u.isActive !== false &&
      u.id !== req.user.id
    );

    // Apply text search filter if query provided
    if (q && q.trim()) {
      const search = q.trim().toLowerCase();
      filtered = filtered.filter(u =>
        (u.username || '').toLowerCase().includes(search) ||
        (u.firstName || '').toLowerCase().includes(search) ||
        (u.lastName || '').toLowerCase().includes(search) ||
        (`${u.firstName || ''} ${u.lastName || ''}`).toLowerCase().includes(search)
      );
    }

    // Paginate
    const total = filtered.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = filtered.slice(skip, skip + parseInt(limit)).map(u => ({
      id: u.id,
      _id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      bio: u.bio,
      travelInterests: u.travelInterests,
      preferredDestinations: u.preferredDestinations,
      isOnline: u.isOnline,
      lastSeen: u.lastSeen,
    }));

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
          hasNext: skip + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
});

export default router;
