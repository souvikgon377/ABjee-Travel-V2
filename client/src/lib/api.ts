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
  timeout: 120000, // 120 seconds for admin endpoints with heavy Firestore queries
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
  searchPlaces: (params?: {
    search?: string;
    location?: string;
    filter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
    page?: number;
    limit?: number;
  }) => api.get('/places', { params }),
  getReviews: (placeId: string, options?: { refresh?: boolean }) =>
    api.get('/reviews', { params: { placeId, ...(options?.refresh ? { refresh: true } : {}) } }),
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

export const walletAPI = {
  redeem: (amount: number) => api.post('/wallet/redeem', { amount }),
  getHistory: (params?: { limit?: number }) => api.get('/wallet/history', { params }),
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
  getSettings: () => adminApiInstance.get('/admin/settings'),
  updateSettings: (data: any) => adminApiInstance.put('/admin/settings', data),
  updatePlacesCache: () => api.post('/update-cache'),
  getTouristPlaceList: (params?: {
    search?: string;
    location?: string;
    filter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
    page?: number;
    limit?: number;
    forceRefresh?: boolean;
  }) => adminApiInstance.get('/admin/tourist-places/list', { params }),
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
  }) => adminApiInstance.post('/admin/tourist-places/create', data),
  getTouristPlace: (id: string) => adminApiInstance.get(`/admin/tourist-places/${id}`),
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
  }) => adminApiInstance.put(`/admin/tourist-places/${id}`, data),
  deleteTouristPlace: (id: string) => adminApiInstance.delete(`/admin/tourist-places/${id}`),
  getTravelItineraryList: (params?: {
    search?: string;
    country?: string;
    page?: number;
    limit?: number;
    forceRefresh?: boolean;
  }) => adminApiInstance.get('/admin/travel-itineraries/list', { params }),
  getUsers: (params?: any) => adminApiInstance.get('/admin/users', { params }),
  getUser: (userId: string) => adminApiInstance.get(`/admin/users/${userId}`),
  createUser: (data: any) => adminApiInstance.post('/admin/users', data),
  updateUser: (userId: string, data: any) => adminApiInstance.put(`/admin/users/${userId}`, data),
  deleteUser: (userId: string) => adminApiInstance.delete(`/admin/users/${userId}`),
  getUserActivity: (userId: string) => adminApiInstance.get(`/admin/users/${userId}/activity`),
  getSubscriptions: (params?: any) => adminApiInstance.get('/admin/subscriptions', { params }),
  getActivity: (params?: any) => adminApiInstance.get('/admin/activity', { params }),
  getRevenue: (params?: any) => adminApiInstance.get('/admin/revenue', { params }),
  getSystemStatus: () => adminApiInstance.get('/admin/system-status'),
  getRedisHealth: () => adminApiInstance.get('/admin/redis-health'),
  getActivityOverview: () => adminApiInstance.get('/admin/activity/overview'),
  getQuotaTelemetry: () => adminApiInstance.get('/admin/quota-telemetry'),
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
  }) => adminApiInstance.get('/admin/export', { params }),
  // Chat Communities
  getChatRooms: (params?: any) => adminApiInstance.get('/admin/chatrooms', { params }),
  getChatRoom: (roomId: string) => adminApiInstance.get(`/admin/chatrooms/${roomId}`),
  createChatRoom: (data: any) => adminApiInstance.post('/admin/chatrooms', data),
  updateChatRoom: (roomId: string, data: any) => adminApiInstance.put(`/admin/chatrooms/${roomId}`, data),
  deleteChatRoom: (roomId: string) => adminApiInstance.delete(`/admin/chatrooms/${roomId}`),
  getRoomMembers: (roomId: string) => adminApiInstance.get(`/admin/chatrooms/${roomId}/members`),
  startTourPlaceSearchMigration: () => adminApiInstance.post('/admin/tour-places/migration/start'),
  getTourPlaceSearchMigrationStatus: (jobId: string) => adminApiInstance.get('/admin/tour-places/migration/status', { params: { jobId } }),
  refreshCache: (scope: string = 'all', rewarm: boolean = true) => adminApiInstance.post('/admin/refresh-cache', { scope, rewarm }),
  getSearchHealth: () => adminApiInstance.get('/admin/search-health'),
  // ABJee Wallet admin endpoints
  getWallets: () => adminApiInstance.get('/admin/wallets'),
  postWalletAction: (userId: string, payload: any) => adminApiInstance.post(`/admin/wallets/${userId}`, payload),
};

export default api;
