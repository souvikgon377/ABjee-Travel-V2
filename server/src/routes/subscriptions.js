import express from 'express';
import { body, validationResult } from 'express-validator';
import subscriptionService from '../models/Subscription.js';
import userService from '../models/User.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  free: {
    type: 'free',
    name: 'Free Plan',
    price: { amount: 0, currency: 'USD' },
    features: {
      privateChatAccess: false,
      maxPrivateChats: 0,
      travelPartnerRequests: 1,
      prioritySupport: false,
      advancedFilters: false,
      profileBoost: false,
      fileUploadLimit: 5,
      customDestinations: false
    }
  },
  pro: {
    type: 'pro',
    name: 'Pro Plan',
    price: { amount: 90, currency: 'USD', interval: 'monthly' },
    yearlyPrice: { amount: 75, currency: 'USD', interval: 'yearly' },
    features: {
      privateChatAccess: true,
      maxPrivateChats: 10,
      travelPartnerRequests: 5,
      prioritySupport: true,
      advancedFilters: true,
      profileBoost: false,
      fileUploadLimit: 25,
      customDestinations: true
    }
  },
  premium: {
    type: 'premium',
    name: 'Premium Plan',
    price: { amount: 150, currency: 'USD', interval: 'monthly' },
    yearlyPrice: { amount: 125, currency: 'USD', interval: 'yearly' },
    features: {
      privateChatAccess: true,
      maxPrivateChats: -1, // Unlimited
      travelPartnerRequests: -1, // Unlimited
      prioritySupport: true,
      advancedFilters: true,
      profileBoost: true,
      fileUploadLimit: 100,
      customDestinations: true
    }
  }
};

// @route   GET /api/subscriptions/plans
// @desc    Get available subscription plans
// @access  Public
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: { plans: SUBSCRIPTION_PLANS }
  });
});

// @route   GET /api/subscriptions/current
// @desc    Get current user's subscription
// @access  Private
router.get('/current', authenticate, async (req, res) => {
  try {
    let subscription = await subscriptionService.findByUserId(req.user.id);

    if (!subscription) {
      // Return a default free subscription shape
      return res.json({
        success: true,
        data: {
          subscription: {
            id: null,
            plan: { type: 'free', name: 'Free Plan', price: { amount: 0, currency: 'USD' } },
            status: 'active',
            startDate: null,
            endDate: null,
            isActive: true,
            features: subscriptionService.getFeaturesForPlan('free'),
            usage: { privateChatsUsed: 0, travelRequestsUsed: 0 },
            billingHistory: [],
            autoRenew: false
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          isActive: subscriptionService.isActive(subscription),
          features: subscription.features,
          usage: subscription.usage,
          nextBillingDate: subscription.nextBillingDate,
          autoRenew: subscription.autoRenew,
          cancellation: subscription.cancellation,
          billingHistory: subscription.billingHistory || []
        }
      }
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription details'
    });
  }
});

// @route   POST /api/subscriptions/upgrade
// @desc    Upgrade subscription (mock implementation)
// @access  Private
router.post('/upgrade', authenticate, [
  body('planType').isIn(['pro', 'premium']).withMessage('Invalid plan type'),
  body('interval').isIn(['monthly', 'yearly']).withMessage('Invalid billing interval'),
  body('paymentMethod').optional().isObject()
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

    const { planType, interval, paymentMethod } = req.body;

    // Get the selected plan
    const selectedPlan = SUBSCRIPTION_PLANS[planType];
    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscription plan'
      });
    }

    // Calculate end date
    const startDate = new Date();
    const endDate = new Date();
    if (interval === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Find or create subscription
    let subscription = await subscriptionService.findByUserId(req.user.id);

    const newPlan = {
      type: planType,
      name: selectedPlan.name,
      price: interval === 'yearly' ? selectedPlan.yearlyPrice : selectedPlan.price
    };
    const features = subscriptionService.getFeaturesForPlan(planType);

    if (!subscription) {
      subscription = await subscriptionService.create({
        user: req.user.id,
        plan: newPlan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        paymentMethod: paymentMethod || { type: 'card' },
        billingHistory: [{
          amount: newPlan.price.amount,
          currency: newPlan.price.currency,
          status: 'paid',
          description: `${selectedPlan.name} - ${interval} subscription`,
          invoiceId: `INV-${Date.now()}`,
          paymentDate: new Date().toISOString()
        }]
      });
    } else {
      subscription = await subscriptionService.update(subscription.id, {
        plan: newPlan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        autoRenew: true,
        cancellation: null,
        ...(paymentMethod ? { paymentMethod } : {}),
        billingHistory: [
          ...(subscription.billingHistory || []),
          {
            amount: newPlan.price.amount,
            currency: newPlan.price.currency,
            status: 'paid',
            description: `${selectedPlan.name} - ${interval} subscription`,
            invoiceId: `INV-${Date.now()}`,
            paymentDate: new Date().toISOString()
          }
        ]
      });
    }

    // Update user's embedded subscription info
    await userService.update(req.user.id, {
      'subscription.type': planType,
      'subscription.isActive': true,
      'subscription.startDate': startDate.toISOString(),
      'subscription.endDate': endDate.toISOString()
    });

    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      data: {
        subscription: {
          id: subscription._id,
          plan: subscription.plan,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          features: subscription.features,
          nextBillingDate: subscription.nextBillingDate
        }
      }
    });

  } catch (error) {
    console.error('Upgrade subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade subscription'
    });
  }
});

// @route   POST /api/subscriptions/cancel
// @desc    Cancel subscription
// @access  Private
router.post('/cancel', authenticate, [
  body('reason').optional().trim().isLength({ max: 500 }),
  body('feedback').optional().trim().isLength({ max: 1000 }),
  body('cancelAtPeriodEnd').optional().isBoolean()
], async (req, res) => {
  try {
    const { reason, feedback, cancelAtPeriodEnd = true } = req.body;

    const subscription = await subscriptionService.findByUserId(req.user.id);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    if (subscription.cancellation && subscription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Subscription is already cancelled'
      });
    }

    // Cancel subscription using service
    const cancelled = await subscriptionService.cancel(subscription.id, reason, cancelAtPeriodEnd);

    // Update user subscription if cancelled immediately
    if (!cancelAtPeriodEnd) {
      await userService.update(req.user.id, {
        'subscription.type': 'free',
        'subscription.isActive': false
      });
    }

    res.json({
      success: true,
      message: cancelAtPeriodEnd 
        ? 'Subscription will be cancelled at the end of the current period'
        : 'Subscription cancelled immediately',
      data: {
        subscription: {
          status: cancelled.status,
          cancellation: cancelled.cancellation,
          endDate: cancelled.endDate
        }
      }
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

// @route   GET /api/subscriptions/usage
// @desc    Get subscription usage statistics
// @access  Private
router.get('/usage', authenticate, async (req, res) => {
  try {
    const subscription = await subscriptionService.findByUserId(req.user.id);

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          usage: {
            privateChats: { used: 0, limit: 0, unlimited: false },
            travelRequests: { used: 0, limit: 1, unlimited: false },
            fileUpload: { limit: 5 },
            lastResetDate: null
          }
        }
      });
    }

    const usage = {
      privateChats: {
        used: subscription.usage.privateChatsUsed,
        limit: subscription.features.maxPrivateChats,
        unlimited: subscription.features.maxPrivateChats === -1
      },
      travelRequests: {
        used: subscription.usage.travelRequestsUsed,
        limit: subscription.features.travelPartnerRequests,
        unlimited: subscription.features.travelPartnerRequests === -1
      },
      fileUpload: {
        limit: subscription.features.fileUploadLimit
      },
      lastResetDate: subscription.usage.lastResetDate
    };

    res.json({
      success: true,
      data: { usage }
    });

  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get usage statistics'
    });
  }
});

// @route   GET /api/subscriptions/billing-history
// @desc    Get billing history
// @access  Private
router.get('/billing-history', authenticate, async (req, res) => {
  try {
    const subscription = await subscriptionService.findByUserId(req.user.id);

    if (!subscription) {
      return res.json({
        success: true,
        data: { billingHistory: [] }
      });
    }

    res.json({
      success: true,
      data: {
        billingHistory: subscription.billingHistory.sort(
          (a, b) => new Date(b.paymentDate) - new Date(a.paymentDate)
        )
      }
    });

  } catch (error) {
    console.error('Get billing history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get billing history'
    });
  }
});

export default router;
