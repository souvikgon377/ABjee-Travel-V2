import axios from 'axios';
import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
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
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData: any) => api.post('/auth/register', userData),
  login: (credentials: any) => api.post('/auth/login', credentials),
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
  getStats: () => api.get('/admin/stats'),
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
  // Chat Rooms
  getChatRooms: (params?: any) => api.get('/admin/chatrooms', { params }),
  getChatRoom: (roomId: string) => api.get(`/admin/chatrooms/${roomId}`),
  createChatRoom: (data: any) => api.post('/admin/chatrooms', data),
  updateChatRoom: (roomId: string, data: any) => api.put(`/admin/chatrooms/${roomId}`, data),
  deleteChatRoom: (roomId: string) => api.delete(`/admin/chatrooms/${roomId}`),
  getRoomMembers: (roomId: string) => api.get(`/admin/chatrooms/${roomId}/members`),
};

export default api;
