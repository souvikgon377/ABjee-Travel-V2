"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, googleProvider } from '../lib/firebase';
import { firestoreDb } from '../lib/firebaseFirestore';
import { resolveAvatarUrl } from '../lib/avatar';
import { trackUserSession, trackUserLogout } from '../lib/analyticsTracker';

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
  changePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
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
  subscription?: Record<string, unknown>;
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
  const pendingProfileRequestRef = useRef<Promise<any> | null>(null);
  const lastProfileFetchRef = useRef<number>(0);
  const userProfileRef = useRef<UserProfile | null>(null);
  const lastFetchedUidRef = useRef<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);

  const isTransientFirebaseNetworkError = useCallback((error: unknown) => {
    const code = typeof (error as { code?: unknown })?.code === 'string'
      ? ((error as { code?: string }).code as string)
      : '';
    const message = typeof (error as { message?: unknown })?.message === 'string'
      ? ((error as { message?: string }).message as string)
      : '';

    return (
      code === 'auth/network-request-failed' ||
      code === 'unavailable' ||
      message.includes('network-request-failed') ||
      message.includes("didn't respond within 10 seconds")
    );
  }, []);

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
      subscription:
        profile.subscription && typeof profile.subscription === 'object'
          ? profile.subscription
          : undefined,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    } as UserProfile;
  }, []);

  useEffect(() => {
    const failSafeTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => clearTimeout(failSafeTimer);
  }, []);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  // Helper to get fresh token
  const refreshToken = useCallback(async (userParam?: any, forceRefresh = false) => {
    const user = userParam || auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    try {
      isRefreshingRef.current = true;
      const token = await user.getIdToken(forceRefresh);
      localStorage.setItem('token', token);
      return token;
    } catch (error) {
      const cachedToken = localStorage.getItem('token');
      if (isTransientFirebaseNetworkError(error) && cachedToken) {
        if ((process.env.NODE_ENV === "development")) {
          console.warn('Using cached token due to transient Firebase network issue.');
        }
        return cachedToken;
      }
      if ((process.env.NODE_ENV === "development")) {
        console.error('Token refresh failed:', error);
      }
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [isTransientFirebaseNetworkError]);

  // Deduplicated fetch of user profile - prevents rapid repeated requests
  const fetchUserProfile = useCallback(async (token: string, forceRefresh = false) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastProfileFetchRef.current;

    // Prevent fetching more than once per 5 seconds
    if (!forceRefresh && timeSinceLastFetch < 5000 && pendingProfileRequestRef.current) {
      return pendingProfileRequestRef.current;
    }

    // Reuse pending request if one is already in flight
    if (pendingProfileRequestRef.current && !forceRefresh && timeSinceLastFetch < 1000) {
      return pendingProfileRequestRef.current;
    }

    const request = fetchWithTimeout('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }
      const data = await response.json();
      return data.data?.user;
    });

    pendingProfileRequestRef.current = request;
    lastProfileFetchRef.current = now;

    try {
      return await request;
    } finally {
      pendingProfileRequestRef.current = null;
    }
  }, []);

  // Create user profile via API
  const createUserProfile = useCallback(async (user: any, additionalData?: any) => {
    if (!user) return;

    try {
      // Set basic profile data from Firebase user (no API call needed for during signup)
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

      setUserProfile((prev) => {
        // Preserve resolved fields (especially role) if fallback profile is incomplete.
        const merged = {
          ...(prev || {}),
          ...(newProfile || {}),
        };
        return normalizeUserProfile(merged);
      });

    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error creating user profile:', error);
      }
      throw error;
    }
  }, [normalizeUserProfile]);

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

      // Use deduplicated fetch for profile
      const profile = await fetchUserProfile(token, true); // forceRefresh=true to bypass throttle for login
      
      if (!profile) {
        throw new Error('Failed to fetch admin profile');
      }

      const role = profile?.role;
      const hasRequiredAccess = requiredRole === 'owner'
        ? role === 'owner'
        : role === 'admin' || role === 'owner';

      if (!hasRequiredAccess) {
        await signOut(auth);
        localStorage.removeItem('token');
        throw new Error(`You are not ${requiredRole}. Please login as a user.`);
      }

      setUserProfile(normalizeUserProfile(profile));
      
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
      // User-initiated cancellations (not real errors)
      const isCancellation = error.code === 'auth/popup-closed-by-user' || 
                            error.code === 'auth/cancelled-popup-request';
      
      if ((process.env.NODE_ENV === "development") && !isCancellation) {
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
      const user = auth.currentUser;
      if (user) {
        await trackUserLogout(user.uid);
      }
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

  // Change password for authenticated users
  const changePassword = async (newPassword: string, currentPassword?: string) => {
    if (!currentUser) {
      throw new Error('You must be signed in to change password.');
    }

    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password should be at least 6 characters.');
    }

    const isEmailPasswordUser = currentUser?.providerData?.some((p: any) => p.providerId === 'password');

    try {
      if (isEmailPasswordUser) {
        if (!currentPassword) {
          throw new Error('Current password is required.');
        }

        if (!currentUser.email) {
          throw new Error('Unable to verify your account email for password change.');
        }

        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
      }

      await updatePassword(currentUser, newPassword);
    } catch (error: any) {
      if ((process.env.NODE_ENV === 'development')) {
        console.error('Password change error:', error);
      }

      const errorMessages: Record<string, string> = {
        'auth/wrong-password': 'Current password is incorrect.',
        'auth/invalid-credential': 'Current password is incorrect.',
        'auth/weak-password': 'New password should be at least 6 characters.',
        'auth/requires-recent-login': 'Please sign in again and then change your password.',
      };

      throw new Error(errorMessages[error?.code] || error?.message || 'Failed to change password. Please try again.');
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
          // Track user session when they come online
          try {
            await trackUserSession(user.uid, user.email || undefined);
          } catch (err) {
            if (process.env.NODE_ENV === 'development') {
              console.error('Error tracking session:', err);
            }
          }

          let token: string | null = localStorage.getItem('token');
          try {
            token = await refreshToken(user);
          } catch (error) {
            if (!isTransientFirebaseNetworkError(error)) {
              throw error;
            }
          }

          if (!token) {
            await createUserProfile(user);
            if (isActive) setLoading(false);
            return;
          }

          const now = Date.now();
          const shouldSkipProfileFetch =
            lastFetchedUidRef.current === user.uid &&
            now - lastFetchedAtRef.current < 60000 &&
            !!userProfileRef.current;

          // Set up periodic token refresh (30 minutes, only if not already set)
          if (!refreshInterval) {
            refreshInterval = setInterval(async () => {
              if (!isActive || isRefreshingRef.current) return;
              try {
                const user = auth.currentUser;
                if (user) await refreshToken(user, true);
              } catch (error) {
                if ((process.env.NODE_ENV === "development") && !isTransientFirebaseNetworkError(error)) {
                  console.error('Periodic token refresh failed:', error);
                }
              }
            }, 1000 * 60 * 30); // 30 minutes
          }

          // Load user profile (deduplicated request)
          if (!shouldSkipProfileFetch) {
            try {
              const profile = await fetchUserProfile(token);
              if (isActive && profile) {
                setUserProfile(normalizeUserProfile(profile));
                lastFetchedUidRef.current = user.uid;
                lastFetchedAtRef.current = Date.now();
              } else if (isActive && !profile) {
                // If profile doesn't exist on backend yet, use Firebase data temporarily
                await createUserProfile(user);
                lastFetchedUidRef.current = user.uid;
                lastFetchedAtRef.current = Date.now();
              }
            } catch (error: any) {
              if ((process.env.NODE_ENV === "development")) {
                console.error('Error loading user profile:', error);
              }
              // Always fallback to Firebase data if API fails (404, timeout, or other errors)
              if (isActive) {
                try {
                  await createUserProfile(user);
                } catch (createError) {
                  if ((process.env.NODE_ENV === "development")) {
                    console.error('Error creating user profile fallback:', createError);
                  }
                }
                lastFetchedUidRef.current = user.uid;
                lastFetchedAtRef.current = Date.now();
              }
            }
          }
        } else {
          if (isActive) {
            setUserProfile(null);
            localStorage.removeItem('token');
            lastFetchedUidRef.current = null;
            lastFetchedAtRef.current = 0;
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
  }, [createUserProfile, normalizeUserProfile, refreshToken, fetchUserProfile, isTransientFirebaseNetworkError]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const userDocRef = doc(firestoreDb, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
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
      },
      (error) => {
        if ((process.env.NODE_ENV === "development") && !isTransientFirebaseNetworkError(error)) {
          console.error('User profile Firestore listener failed:', error);
        }
      }
    );

    return () => unsubscribe();
  }, [currentUser?.uid, normalizeUserProfile, isTransientFirebaseNetworkError]);

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
    changePassword,
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
    changePassword,
    updateUserProfile
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
