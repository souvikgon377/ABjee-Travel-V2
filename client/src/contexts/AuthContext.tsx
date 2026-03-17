"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider } from '../lib/firebase';
import { firestoreDb } from '../lib/firebaseFirestore';
import { resolveAvatarUrl } from '../lib/avatar';

const REQUEST_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

interface AuthContextType {
  currentUser: any | null;
  user: any | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signup: (email: string, password: string, additionalData?: any) => Promise<{ success: boolean; user: any }>;
  login: (email: string, password: string) => Promise<void>;
  adminLogin: (email: string, password: string, requiredRole?: 'admin' | 'owner') => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  avatar?: string;
  profilePicture?: string;
  profileImage?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  username?: string;
  role?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const isRefreshingRef = useRef(false);

  const normalizeUserProfile = useCallback((profile: any): UserProfile | null => {
    if (!profile) return null;

    const mergedPhotoURL = resolveAvatarUrl(profile) || '';

    return {
      uid: profile.uid || profile.id || '',
      email: profile.email || '',
      displayName: profile.displayName || profile.username || profile.email || '',
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoURL: mergedPhotoURL,
      avatar: typeof profile.avatar === 'string' ? profile.avatar : mergedPhotoURL,
      profilePicture: typeof profile.profilePicture === 'string' ? profile.profilePicture : undefined,
      profileImage: typeof profile.profileImage === 'string' ? profile.profileImage : mergedPhotoURL,
      address: profile.address,
      city: profile.city,
      zipCode: profile.zipCode,
      username: profile.username,
      role: profile.role,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    } as UserProfile;
  }, []);

  useEffect(() => {
    const failSafeTimer = setTimeout(() => {
      setLoading(false);
    }, 8000);

    return () => clearTimeout(failSafeTimer);
  }, []);

  // Helper to get fresh token
  const refreshToken = useCallback(async (user = currentUser) => {
    if (!user) throw new Error('No authenticated user');
    try {
      isRefreshingRef.current = true;
      const token = await user.getIdToken(true);
      localStorage.setItem('token', token);
      return token;
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Token refresh failed:', error);
      }
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [currentUser]);

  // Create user profile via API
  const createUserProfile = async (user: any, additionalData?: any) => {
    if (!user) return;

    try {
      const token = await refreshToken(user);
      
      // Check if profile exists
      const checkResponse = await fetchWithTimeout('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (checkResponse.ok) {
        const { data } = await checkResponse.json();
        setUserProfile(normalizeUserProfile(data.user));
        return;
      }

      // Set basic profile data from Firebase user
      const { displayName, email, photoURL } = user;
      const newProfile = normalizeUserProfile({
        uid: user.uid,
        email,
        displayName: displayName || '',
        photoURL: photoURL || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...additionalData,
      });

      setUserProfile(newProfile);

    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error creating user profile:', error);
      }
      throw error;
    }
  };

  // Sign up with email and password
  const signup = async (email: string, password: string, additionalData?: any) => {
    try {
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      
      if (additionalData?.firstName && additionalData?.lastName) {
        const displayName = `${additionalData.firstName} ${additionalData.lastName}`;
        await updateProfile(user, { displayName });
        additionalData.displayName = displayName;
      }

      await createUserProfile(user, additionalData);
      return { success: true, user };

    } catch (error: any) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Signup error:', error);
      }
      const errorMessages: Record<string, string> = {
        'auth/email-already-in-use': 'This email is already registered. Please use a different email or sign in.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
      };
      throw new Error(errorMessages[error.code] || 'Failed to create account. Please try again.');
    }
  };

  // Sign in with email and password
  const login = async (email: string, password: string) => {
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const token = await refreshToken(user);
      localStorage.setItem('token', token);
    } catch (error: any) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Login error:', error);
      }
      const errorMessages: Record<string, string> = {
        'auth/user-not-found': 'Invalid email or password.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many failed login attempts. Please try again later.',
      };
      throw new Error(errorMessages[error.code] || 'Failed to log in. Please try again.');
    }
  };

  // Admin login with Firebase email/password + role verification
  const adminLogin = async (email: string, password: string, requiredRole: 'admin' | 'owner' = 'admin') => {
    try {
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Initiating admin login...');
      }

      const signInResult = await signInWithEmailAndPassword(auth, email, password);
      const user = signInResult.user;

      const token = await refreshToken(user);
      localStorage.setItem('token', token);

      const profileResponse = await fetchWithTimeout('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const profileResult = await profileResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileResult.message || 'Failed to verify admin profile');
      }

      const role = profileResult?.data?.user?.role;
      const hasRequiredAccess = requiredRole === 'owner'
        ? role === 'owner'
        : role === 'admin' || role === 'owner';

      if (!hasRequiredAccess) {
        await signOut(auth);
        localStorage.removeItem('token');
        throw new Error(`You are not ${requiredRole}. Please login as a user.`);
      }

      setUserProfile(normalizeUserProfile(profileResult.data.user));
      
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Admin login complete');
      }
    } catch (error: any) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('[Auth] Admin login error:', error);
      }
      if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/user-not-found' || error?.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password.');
      }
      throw new Error(error.message || 'Failed to log in as admin. Please try again.');
    }
  };

  // Sign in with Google
  const loginWithGoogle = async () => {
    try {
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Initiating Google Sign-In...');
      }
      const result = await signInWithPopup(auth, googleProvider);
      const { user } = result;
      
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Google Sign-In successful, getting token...');
      }
      const token = await refreshToken(user);
      localStorage.setItem('token', token);
      
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Creating/updating user profile...');
      }
      await createUserProfile(user);
      
      if ((process.env.NODE_ENV === "development")) {
        console.log('[Auth] Google Sign-In complete');
      }
    } catch (error: any) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('[Auth] Google login error:', error);
        console.error('[Auth] Error code:', error.code);
        console.error('[Auth] Error message:', error.message);
      }
      
      const errorMessages: Record<string, string> = {
        'auth/popup-closed-by-user': 'Sign in cancelled. Please try again.',
        'auth/popup-blocked': 'Popup blocked. Please allow popups for this site.',
        'auth/cancelled-popup-request': 'Sign in cancelled. Please try again.',
        'auth/unauthorized-domain': 'This domain is not authorized. Please contact support.',
        'auth/operation-not-allowed': 'Google Sign-In is not enabled. Please contact support.',
      };
      throw new Error(errorMessages[error.code] || 'Failed to sign in with Google. Please try again.');
    }
  };

  // Sign out
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      localStorage.removeItem('token');
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Logout error:', error);
      }
      throw error;
    }
  }, []);

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Password reset error:', error);
      }
      const errorMessages: Record<string, string> = {
        'auth/user-not-found': 'No account found with this email address.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many requests. Please try again later.',
      };
      throw new Error(errorMessages[error.code] || 'Failed to send password reset email. Please try again.');
    }
  };

  // Update user profile
  const updateUserProfile = async (data: Partial<UserProfile>) => {
    if (!currentUser) return;

    try {
      const token = await refreshToken();
      const response = await fetchWithTimeout('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      const { data: updatedUser } = await response.json();
      setUserProfile(normalizeUserProfile(updatedUser));
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error updating user profile:', error);
      }
      throw error;
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    let isActive = true;
    let refreshInterval: NodeJS.Timeout | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isActive) return;
      
      try {
        setCurrentUser(user);
      
        if (user) {
          const token = await refreshToken(user);

          // Set up periodic token refresh (30 minutes)
          refreshInterval = setInterval(async () => {
            if (!isActive || isRefreshingRef.current) return;
            try {
              const freshToken = await refreshToken(user);
              localStorage.setItem('token', freshToken);
            } catch (error) {
              if ((process.env.NODE_ENV === "development")) {
                console.error('Periodic token refresh failed:', error);
              }
            }
          }, 1000 * 60 * 30); // 30 minutes

          // Load user profile
          try {
            const response = await fetchWithTimeout('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            if (response.ok) {
              const { data } = await response.json();
              if (isActive) setUserProfile(normalizeUserProfile(data.user));
            } else {
              await createUserProfile(user);
            }
          } catch (error) {
            if ((process.env.NODE_ENV === "development")) {
              console.error('Error loading user profile:', error);
            }
            await createUserProfile(user);
          }
        } else {
          if (isActive) {
            setUserProfile(null);
            localStorage.removeItem('token');
          }
        }
      } catch (error) {
        if ((process.env.NODE_ENV === "development")) {
          console.error('Auth state change error:', error);
        }
      } finally {
        if (isActive) setLoading(false);
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [createUserProfile, normalizeUserProfile, refreshToken]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const userDocRef = doc(firestoreDb, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const snapshotProfile = normalizeUserProfile({
        id: snapshot.id,
        uid: snapshot.id,
        ...snapshot.data(),
      });

      if (!snapshotProfile) return;

      setUserProfile((prev) => {
        const merged = {
          ...(prev || {}),
          ...snapshotProfile,
        };

        return normalizeUserProfile(merged);
      });
    });

    return () => unsubscribe();
  }, [currentUser?.uid, normalizeUserProfile]);

  const value: AuthContextType = useMemo(() => ({
    currentUser,
    user: currentUser,
    userProfile,
    loading,
    signup,
    login,
    adminLogin,
    loginWithGoogle,
    logout,
    resetPassword,
    updateUserProfile,
  }), [
    currentUser,
    userProfile,
    loading,
    signup,
    login,
    adminLogin,
    loginWithGoogle,
    logout,
    resetPassword,
    updateUserProfile
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
