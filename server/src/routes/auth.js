import express from 'express';
import { authenticate } from '../middleware/auth.js';
import userService from '../models/User.js';
import { db } from '../config/database.js';
import admin from '../config/firebase-admin.js';

const router = express.Router();

// @route   POST /api/auth/admin-login
// @desc    Admin login with email and password
// @access  Public
router.post('/admin-login', async (req, res) => {
  try {
    console.log('[Admin Login] Request received:', { email: req.body.email, hasPassword: !!req.body.password });
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[Admin Login] Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    console.log('[Admin Login] Searching for admin with email:', email);
    
    // Check admins collection - try exact match first
    let adminsSnapshot = await db.collection('admins')
      .where('email', '==', email)
      .limit(1)
      .get();

    // If not found, try case-insensitive search
    if (adminsSnapshot.empty) {
      console.log('[Admin Login] Exact match not found, trying case-insensitive');
      const allAdmins = await db.collection('admins').get();
      console.log('[Admin Login] Total admins in collection:', allAdmins.size);
      
      // Manual case-insensitive search
      const adminDoc = allAdmins.docs.find(doc => {
        const data = doc.data();
        console.log('[Admin Login] Checking admin:', data.email);
        return data.email.toLowerCase() === email.toLowerCase();
      });
      
      if (adminDoc) {
        console.log('[Admin Login] Found admin with case-insensitive match');
        adminsSnapshot = { empty: false, docs: [adminDoc] };
      }
    }

    if (adminsSnapshot.empty) {
      console.log('[Admin Login] No admin found with email:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const adminDoc = adminsSnapshot.docs[0];
    const adminData = adminDoc.data();
    console.log('[Admin Login] Admin found:', { 
      email: adminData.email, 
      hasPassword: !!adminData.password,
      passwordLength: adminData.password?.length 
    });

    // Verify password
    console.log('[Admin Login] Comparing passwords:', {
      provided: password,
      stored: adminData.password,
      match: adminData.password === password
    });

    if (adminData.password !== password) {
      console.log('[Admin Login] Password mismatch');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    console.log('[Admin Login] Password verified, checking users collection');

    // Create or get user in users collection with admin role
    let user = await userService.findByEmail(email);
    console.log('[Admin Login] Existing user:', user ? 'Found' : 'Not found');

    if (!user) {
      // Create admin user
      console.log('[Admin Login] Creating new admin user');
      const adminUser = {
        email: email.toLowerCase(),
        displayName: adminData.displayName || 'Admin',
        firstName: adminData.firstName || 'Admin',
        lastName: adminData.lastName || '',
        username: email.split('@')[0],
        role: 'admin',
        isActive: true,
        emailVerified: true,
        firebaseUid: null
      };

      const userDoc = await db.collection('users').add({
        ...adminUser,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      user = { id: userDoc.id, ...adminUser };
      console.log('[Admin Login] Created user with ID:', userDoc.id);
    } else if (user.role !== 'admin') {
      // Update existing user to admin
      console.log('[Admin Login] Updating user role to admin');
      await userService.update(user.id, { role: 'admin' });
      user.role = 'admin';
    }

    console.log('[Admin Login] Creating custom token for user ID:', user.id);

    // Create custom token for Firebase Auth
    const customToken = await admin.auth().createCustomToken(user.id, {
      email: user.email,
      role: 'admin'
    });

    console.log('[Admin Login] Custom token created successfully');

    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        user,
        token: customToken,
        customToken: customToken
      }
    });

  } catch (error) {
    console.error('[Admin Login] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile (Firebase)
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // req.user is already populated by middleware with Firebase user data
    const user = { ...req.user };

    return res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user profile' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (mark offline)
// @access  Private
router.post('/logout', authenticate, async (req, res) => {
  try {
    if (req.user && req.user.id) {
      await userService.updateStatus(req.user.id, false);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

export default router;