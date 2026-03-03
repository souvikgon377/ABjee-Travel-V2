import admin from '../config/firebase-admin.js';
import userService from '../models/User.js';
import { db } from '../config/database.js';

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

      // Resolve elevated role from admins collection (Firebase-driven admin access)
      let elevatedRole = null;
      const tokenRole = decodedToken?.role;
      if (tokenRole === 'admin' || tokenRole === 'owner') {
        elevatedRole = tokenRole;
      }

      if (normalizedEmail) {
        let adminSnapshot = await db
          .collection('admins')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();

        // Fallback for legacy mixed-case email values in admins collection
        if (adminSnapshot.empty) {
          const allAdmins = await db.collection('admins').get();
          const matchedAdmin = allAdmins.docs.find((doc) => {
            const data = doc.data();
            return (data?.email || '').toLowerCase() === normalizedEmail;
          });

          if (matchedAdmin) {
            adminSnapshot = { empty: false, docs: [matchedAdmin] };
          }
        }

        if (!adminSnapshot.empty) {
          const adminData = adminSnapshot.docs[0].data();
          const candidateRole = adminData?.role;
          if (candidateRole === 'admin' || candidateRole === 'owner') {
            elevatedRole = candidateRole;
          } else {
            elevatedRole = 'admin';
          }
        }
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
      
      // Update user's last seen
      await userService.update(user.id, { lastSeen: new Date() });
      
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
        await userService.update(user.id, { lastSeen: new Date() });
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
