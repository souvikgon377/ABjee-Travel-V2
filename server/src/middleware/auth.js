import admin from '../config/firebase-admin.js';
import userService from '../models/User.js';
import { db } from '../config/database.js';

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_SEEN_UPDATE_MS = 2 * 60 * 1000;
let adminRoleCache = new Map();
let adminRoleCacheLoadedAt = 0;

const shouldUpdateLastSeen = (lastSeen) => {
  if (!lastSeen) return true;
  const value = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  if (Number.isNaN(value.getTime())) return true;
  return Date.now() - value.getTime() > LAST_SEEN_UPDATE_MS;
};

const getRoleFromTokenClaims = (decodedToken) => {
  const tokenRole = decodedToken?.role;
  return tokenRole === 'admin' || tokenRole === 'owner' ? tokenRole : null;
};

const getCachedAdminRole = async (normalizedEmail) => {
  if (!normalizedEmail) {
    return null;
  }

  const now = Date.now();
  if (now - adminRoleCacheLoadedAt > ADMIN_CACHE_TTL_MS) {
    const allAdminsSnapshot = await db.collection('admins').get();
    const nextCache = new Map();

    allAdminsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const email = (data?.email || '').toLowerCase();
      if (!email) return;

      const role = data?.role;
      nextCache.set(email, role === 'owner' ? 'owner' : 'admin');
    });

    adminRoleCache = nextCache;
    adminRoleCacheLoadedAt = now;
  }

  return adminRoleCache.get(normalizedEmail) || null;
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      const normalizedEmail = (decodedToken.email || '').toLowerCase();

      // Resolve elevated role from token first, then cached admins collection fallback
      let elevatedRole = getRoleFromTokenClaims(decodedToken);
      if (!elevatedRole && normalizedEmail) {
        elevatedRole = await getCachedAdminRole(normalizedEmail);
      }

      // Get or create user in our database
      let user = await userService.findByFirebaseUid(decodedToken.uid);
      
      if (!user) {
        // Create new user if they don't exist in our database
        const displayName = decodedToken.name || '';
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        user = await userService.createWithId(decodedToken.uid, {
          firebaseUid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          displayName: displayName,
          firstName: firstName,
          lastName: lastName,
          username: decodedToken.email?.split('@')[0] || '',
          avatar: decodedToken.picture || '',
          role: elevatedRole || 'user'
        });
      } else {
        // Check if existing user needs firstName/lastName populated
        if ((!user.firstName || !user.lastName) && user.displayName) {
          const nameParts = user.displayName.split(' ');
          const updates = {};
          if (!user.firstName && nameParts[0]) {
            updates.firstName = nameParts[0];
          }
          if (!user.lastName && nameParts.length > 1) {
            updates.lastName = nameParts.slice(1).join(' ');
          }
          if (!user.username && user.email) {
            updates.username = user.email.split('@')[0];
          }
          
          if (Object.keys(updates).length > 0) {
            await userService.update(user.id, updates);
            user = { ...user, ...updates };
          }
        }

        // Keep user role in sync with admins collection
        if (elevatedRole && user.role !== elevatedRole) {
          await userService.update(user.id, { role: elevatedRole });
          user = { ...user, role: elevatedRole };
        }
      }
      
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated.'
        });
      }
      
      // Update user's last seen (throttled to reduce write pressure)
      if (shouldUpdateLastSeen(user.lastSeen)) {
        await userService.update(user.id, { lastSeen: new Date() });
      }
      
      // Attach user to request object
      req.user = user;
      next();
      
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed.'
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await userService.findByFirebaseUid(decodedToken.uid);
      
      if (user && user.isActive) {
        if (shouldUpdateLastSeen(user.lastSeen)) {
          await userService.update(user.id, { lastSeen: new Date() });
        }
        req.user = user;
      } else {
        req.user = null;
      }
      
    } catch (tokenError) {
      req.user = null;
    }
    
    next();
    
  } catch (error) {
    console.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

// Check if user has active subscription
const requireSubscription = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  if (!userService.canAccessPrivateChat(req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Active subscription required for this feature.',
      upgradeRequired: true
    });
  }
  
  next();
};

// Check specific subscription type
export const requireSubscriptionType = (requiredTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    const userSubscriptionType = req.user.subscription?.type || 'free';
    
    if (!requiredTypes.includes(userSubscriptionType)) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredTypes.join(' or ')} subscription.`,
        currentSubscription: userSubscriptionType,
        requiredSubscriptions: requiredTypes,
        upgradeRequired: true
      });
    }
    
    if (!userService.hasActiveSubscription(req.user) && userSubscriptionType !== 'free') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew to continue.',
        subscriptionExpired: true
      });
    }
    
    next();
  };
};

// Admin only middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  // Check if user has admin role
  if (!['admin', 'owner'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.'
    });
  }
  
  next();
};

// Export all middleware functions
export {
  authenticate,
  optionalAuth,
  requireSubscription,
  requireAdmin
};
