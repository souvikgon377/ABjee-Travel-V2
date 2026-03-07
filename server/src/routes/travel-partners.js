import express from 'express';
import { body, query, validationResult } from 'express-validator';
import travelPartnerRequestService from '../models/TravelPartnerRequest.js';
import userService from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { db } from '../config/database.js';

const router = express.Router();

const COLLECTION = 'travelPartnerRequests';

// Helper: get all active public requests from Firestore and filter in memory
const getPublicRequests = async () => {
  const snapshot = await db.collection(COLLECTION)
    .where('status', '==', 'active')
    .where('isPublic', '==', true)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Helper: get requests by requester ID
const getRequestsByUser = async (requesterId) => {
  const snapshot = await db.collection(COLLECTION)
    .where('requester', '==', requesterId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Helper: count active requests by user
const countActiveByUser = async (requesterId) => {
  const snapshot = await db.collection(COLLECTION)
    .where('requester', '==', requesterId)
    .where('status', '==', 'active')
    .get();
  return snapshot.size;
};

// @route   GET /api/travel-partners/requests
// @desc    Get travel partner requests with filters
// @access  Private
router.get('/requests', authenticate, [
  query('destination').optional().isString(),
  query('country').optional().isString(),
  query('city').optional().isString(),
  query('travelStyle').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { destination, country, city, travelStyle, page = 1, limit = 20 } = req.query;
    const now = Date.now();

    let requests = await getPublicRequests();

    // Exclude own requests and expired ones
    requests = requests.filter(r => {
      if (r.requester === req.user.id) return false;
      const startTs = r.startDate ? new Date(r.startDate).getTime() : 0;
      const expiresTs = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
      if (startTs && startTs < now) return false;
      if (expiresTs && expiresTs < now) return false;
      return true;
    });

    // In-memory filters
    if (destination) {
      const d = destination.toLowerCase();
      requests = requests.filter(r =>
        (r.destination?.country || '').toLowerCase().includes(d) ||
        (r.destination?.city || '').toLowerCase().includes(d) ||
        (r.destination?.region || '').toLowerCase().includes(d)
      );
    }
    if (country) {
      requests = requests.filter(r => (r.destination?.country || '').toLowerCase().includes(country.toLowerCase()));
    }
    if (city) {
      requests = requests.filter(r => (r.destination?.city || '').toLowerCase().includes(city.toLowerCase()));
    }
    if (travelStyle) {
      requests = requests.filter(r => r.travelStyle === travelStyle);
    }

    const total = requests.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginated = requests.slice(skip, skip + parseInt(limit));

    for (const r of paginated) {
      travelPartnerRequestService.incrementViews(r.id).catch(() => {});
    }

    const enriched = await Promise.all(paginated.map(async (request) => {
      let requester = null;
      if (request.requester) {
        try {
          const u = await userService.findById(request.requester);
          if (u) requester = { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, avatar: u.avatar, travelInterests: u.travelInterests };
        } catch { }
      }
      return {
        id: request.id,
        title: request.title,
        description: request.description,
        destination: request.destination,
        startDate: request.startDate,
        endDate: request.endDate,
        budget: request.budget,
        groupSize: request.groupSize,
        travelStyle: request.travelStyle,
        accommodation: request.accommodation,
        transportation: request.transportation,
        interests: request.interests,
        partnerRequirements: request.partnerRequirements,
        requester,
        responseCount: request.responseCount || 0,
        views: request.views || 0,
        createdAt: request.createdAt,
        hasResponded: (request.responses || []).some(r => r.user === req.user.id)
      };
    }));

    res.json({
      success: true,
      data: {
        requests: enriched,
        pagination: {
          page: parseInt(page), limit: parseInt(limit), total,
          pages: Math.ceil(total / parseInt(limit)),
          hasNext: skip + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get travel requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get travel partner requests' });
  }
});

// @route   POST /api/travel-partners/requests
// @desc    Create a new travel partner request
// @access  Private
router.post('/requests', authenticate, [
  body('title').trim().isLength({ min: 10, max: 100 }).withMessage('Title must be between 10 and 100 characters'),
  body('description').trim().isLength({ min: 50, max: 1000 }).withMessage('Description must be between 50 and 1000 characters'),
  body('destination.country').trim().notEmpty().withMessage('Country is required'),
  body('startDate').isISO8601().custom(value => {
    if (new Date(value) <= new Date()) throw new Error('Start date must be in the future');
    return true;
  }),
  body('endDate').isISO8601().custom((value, { req }) => {
    if (new Date(value) <= new Date(req.body.startDate)) throw new Error('End date must be after start date');
    return true;
  }),
  body('travelStyle').isIn(['budget', 'mid-range', 'luxury', 'backpacking', 'adventure', 'relaxed', 'cultural', 'party']),
  body('groupSize.preferred').isInt({ min: 1, max: 20 }),
  body('groupSize.maximum').isInt({ min: 1, max: 20 }),
  body('interests').isArray({ min: 1 }).withMessage('At least one interest is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const activeCount = await countActiveByUser(req.user.id);
    const maxRequests = req.user.subscription?.type === 'premium' ? -1
      : req.user.subscription?.type === 'pro' ? 5 : 1;

    if (maxRequests !== -1 && activeCount >= maxRequests) {
      return res.status(403).json({
        success: false,
        message: `You have reached your limit of ${maxRequests} active travel partner request(s)`,
        upgradeRequired: true
      });
    }

    const travelRequest = await travelPartnerRequestService.create({
      ...req.body,
      requester: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Travel partner request created successfully',
      data: {
        request: {
          id: travelRequest.id,
          title: travelRequest.title,
          description: travelRequest.description,
          destination: travelRequest.destination,
          startDate: travelRequest.startDate,
          endDate: travelRequest.endDate,
          budget: travelRequest.budget,
          groupSize: travelRequest.groupSize,
          travelStyle: travelRequest.travelStyle,
          interests: travelRequest.interests,
          requester: { id: req.user.id, username: req.user.username, firstName: req.user.firstName, lastName: req.user.lastName, avatar: req.user.avatar },
          status: travelRequest.status,
          createdAt: travelRequest.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Create travel request error:', error);
    res.status(500).json({ success: false, message: 'Failed to create travel partner request' });
  }
});

// @route   GET /api/travel-partners/requests/:requestId
// @desc    Get specific travel partner request
// @access  Private
router.get('/requests/:requestId', authenticate, async (req, res) => {
  try {
    const request = await travelPartnerRequestService.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Travel partner request not found' });
    }

    travelPartnerRequestService.incrementViews(request.id).catch(() => {});

    let requester = null;
    if (request.requester) {
      try {
        const u = await userService.findById(request.requester);
        if (u) requester = { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, avatar: u.avatar, bio: u.bio, travelInterests: u.travelInterests };
      } catch { }
    }

    const userResponse = (request.responses || []).find(r => r.user === req.user.id);

    res.json({
      success: true,
      data: {
        request: {
          id: request.id, title: request.title, description: request.description,
          destination: request.destination, startDate: request.startDate, endDate: request.endDate,
          budget: request.budget, groupSize: request.groupSize, travelStyle: request.travelStyle,
          accommodation: request.accommodation, transportation: request.transportation,
          interests: request.interests, partnerRequirements: request.partnerRequirements,
          requester, status: request.status,
          responses: request.responses || [], matchedPartners: request.matchedPartners || [],
          responseCount: request.responseCount || 0, views: (request.views || 0) + 1,
          isPublic: request.isPublic, allowDirectContact: request.allowDirectContact,
          expiresAt: request.expiresAt, createdAt: request.createdAt,
          isOwner: request.requester === req.user.id,
          hasResponded: !!userResponse, userResponse
        }
      }
    });

  } catch (error) {
    console.error('Get travel request error:', error);
    res.status(500).json({ success: false, message: 'Failed to get travel partner request' });
  }
});

// @route   POST /api/travel-partners/requests/:requestId/respond
// @desc    Respond to a travel partner request
// @access  Private
router.post('/requests/:requestId/respond', authenticate, [
  body('message').trim().isLength({ min: 10, max: 500 }).withMessage('Response message must be between 10 and 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const request = await travelPartnerRequestService.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Travel partner request not found' });
    if (request.status !== 'active') return res.status(400).json({ success: false, message: 'This request is no longer active' });
    if (request.requester === req.user.id) return res.status(400).json({ success: false, message: 'You cannot respond to your own request' });
    if (travelPartnerRequestService.isExpired(request)) return res.status(400).json({ success: false, message: 'This request has expired' });

    try {
      const updated = await travelPartnerRequestService.addResponse(request.id, req.user.id, req.body.message);
      const responses = updated.responses || [];
      res.json({ success: true, message: 'Response sent successfully', data: { responseId: responses[responses.length - 1]?.respondedAt || Date.now() } });
    } catch (innerError) {
      if (innerError.message === 'User has already responded to this request') {
        return res.status(400).json({ success: false, message: 'You have already responded to this request' });
      }
      throw innerError;
    }

  } catch (error) {
    console.error('Respond to travel request error:', error);
    res.status(500).json({ success: false, message: 'Failed to send response' });
  }
});

// @route   GET /api/travel-partners/my-requests
// @desc    Get current user's travel partner requests
// @access  Private
router.get('/my-requests', authenticate, [
  query('status').optional().isIn(['active', 'matched', 'completed', 'cancelled', 'expired']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let requests = await getRequestsByUser(req.user.id);
    if (status) requests = requests.filter(r => r.status === status);

    const total = requests.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginated = requests.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        requests: paginated.map(r => ({
          id: r.id, title: r.title, destination: r.destination,
          startDate: r.startDate, endDate: r.endDate, status: r.status,
          responseCount: r.responseCount || 0, views: r.views || 0,
          responses: r.responses || [], matchedPartners: r.matchedPartners || [],
          createdAt: r.createdAt, expiresAt: r.expiresAt
        })),
        pagination: {
          page: parseInt(page), limit: parseInt(limit), total,
          pages: Math.ceil(total / parseInt(limit)),
          hasNext: skip + parseInt(limit) < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get my requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to get your travel requests' });
  }
});

export default router;
