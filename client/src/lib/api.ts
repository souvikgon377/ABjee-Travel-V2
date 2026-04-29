import axios from 'axios';
import { auth } from './firebase';

const API_BASE_URL = '';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Admin API instance with longer timeout for heavy queries
const adminApiInstance = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 60000, // 60 seconds for admin/stats which does multiple Firebase queries
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // If token retrieval fails, proceed without auth header
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect only when an authenticated session exists but token became invalid/expired.
      // Signed-out users should be able to browse public pages without forced auth redirects.
      if (auth.currentUser && window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

// Admin API interceptors (same as api, but with longer timeout)
adminApiInstance.interceptors.request.use(
  async (config) => {
    try {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // If token retrieval fails, proceed without auth header
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

adminApiInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect only when an authenticated session exists but token became invalid/expired.
      if (auth.currentUser && window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  // Auth methods handled via Firebase Client SDK in AuthContext.tsx
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/me'),
  refreshToken: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
};

// Travel Partners API
export const travelPartnersAPI = {
  getRequests: (params?: any) => api.get('/travel-partners/requests', { params }),
  createRequest: (requestData: any) => api.post('/travel-partners/requests', requestData),
  getRequest: (requestId: string) => api.get(`/travel-partners/requests/${requestId}`),
  respondToRequest: (requestId: string, message: string) => 
    api.post(`/travel-partners/requests/${requestId}/respond`, { message }),
  getMyRequests: (params?: any) => api.get('/travel-partners/my-requests', { params }),
};

// Users API
export const usersAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (profileData: any) => api.put('/users/profile', profileData),
  searchUsers: (params?: any) => api.get('/users/search', { params }),
};

export const placesAPI = {
  getReviews: (placeId: string) => api.get('/reviews', { params: { placeId } }),
  createReview: (payload: {
    placeId: string;
    text: string;
    rating: number;
    media: Array<{
      url: string;
      publicId: string;
      type: 'image' | 'video';
      caption?: string;
      thumbnail?: string;
    }>;
  }) => api.post('/reviews', payload),
  deleteReview: (placeId: string, reviewId: string) => api.delete(`/reviews/${reviewId}`, { params: { placeId } }),
};

// Subscriptions API
export const subscriptionsAPI = {
  getPlans: () => api.get('/subscriptions/plans'),
  getCurrentSubscription: () => api.get('/subscriptions/current'),
  upgrade: (planData: any) => api.post('/subscriptions/upgrade', planData),
  cancel: (cancelData?: any) => api.post('/subscriptions/cancel', cancelData),
  getUsage: () => api.get('/subscriptions/usage'),
  getBillingHistory: () => api.get('/subscriptions/billing-history'),
};

// Admin API
export const adminAPI = {
  getStats: () => adminApiInstance.get('/admin/stats'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data: any) => api.put('/admin/settings', data),
  getPlaces: (params?: {
    search?: string;
    location?: string;
    filter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
    page?: number;
    limit?: number;
  }) => api.get('/places', { params }),
  updatePlacesCache: () => api.post('/update-cache'),
  getTouristPlaceList: (params?: {
    search?: string;
    location?: string;
    filter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
    page?: number;
    limit?: number;
    forceRefresh?: boolean;
  }) => api.get('/admin/tourist-places/list', { params }),
  createTouristPlace: (data: {
    name: string;
    area?: string;
    city?: string;
    state: string;
    country: string;
    description?: string;
    category?: string;
    googleMapsUrl?: string;
    coverImage?: string;
    media?: unknown[];
    extraInfo?: unknown[];
    isActive?: boolean;
  }) => api.post('/admin/tourist-places/create', data),
  updateTouristPlace: (id: string, data: {
    name: string;
    area?: string;
    city?: string;
    state: string;
    country: string;
    description?: string;
    category?: string;
    googleMapsUrl?: string;
    coverImage?: string;
    media?: unknown[];
    extraInfo?: unknown[];
    isActive?: boolean;
  }) => api.put('/admin/tourist-places', data, { params: { id } }),
  deleteTouristPlace: (id: string) => api.delete('/admin/tourist-places', { params: { id } }),
  getTravelItineraryList: (params?: {
    search?: string;
    country?: string;
    page?: number;
    limit?: number;
    forceRefresh?: boolean;
  }) => api.get('/admin/travel-itineraries/list', { params }),
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  getUser: (userId: string) => api.get(`/admin/users/${userId}`),
  createUser: (data: any) => api.post('/admin/users', data),
  updateUser: (userId: string, data: any) => api.put(`/admin/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),
  getUserActivity: (userId: string) => api.get(`/admin/users/${userId}/activity`),
  getSubscriptions: (params?: any) => api.get('/admin/subscriptions', { params }),
  getActivity: (params?: any) => api.get('/admin/activity', { params }),
  getRevenue: (params?: any) => api.get('/admin/revenue', { params }),
  getSystemStatus: () => api.get('/admin/system-status'),
  getRedisHealth: () => api.get('/admin/redis-health'),
  getActivityOverview: () => api.get('/admin/activity/overview'),
  getQuotaTelemetry: () => api.get('/admin/quota-telemetry'),
  exportSectionChunk: (params: {
    section: string;
    limit?: number;
    cursor?: string | null;
    userId?: string;
    area?: string;
    state?: string;
    country?: string;
    place?: string;
    type?: 'all' | 'review' | 'comment';
  }) => api.get('/admin/export', { params }),
  // Chat Communities
  getChatRooms: (params?: any) => api.get('/admin/chatrooms', { params }),
  getChatRoom: (roomId: string) => api.get(`/admin/chatrooms/${roomId}`),
  createChatRoom: (data: any) => api.post('/admin/chatrooms', data),
  updateChatRoom: (roomId: string, data: any) => api.put(`/admin/chatrooms/${roomId}`, data),
  deleteChatRoom: (roomId: string) => api.delete(`/admin/chatrooms/${roomId}`),
  getRoomMembers: (roomId: string) => api.get(`/admin/chatrooms/${roomId}/members`),
  startTourPlaceSearchMigration: () => api.post('/admin/tour-places/migration/start'),
  getTourPlaceSearchMigrationStatus: (jobId: string) => api.get('/admin/tour-places/migration/status', { params: { jobId } }),
  refreshCache: (scope: string = 'all', rewarm: boolean = true) => api.post('/admin/refresh-cache', { scope, rewarm }),
  getSearchHealth: () => api.get('/admin/search-health'),
};

export default api;
