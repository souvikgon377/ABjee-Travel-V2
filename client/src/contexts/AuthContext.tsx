import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  signInWithCustomToken,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthContextType {
  currentUser: any | null;
  user: any | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signup: (email: string, password: string, additionalData?: any) => Promise<{ success: boolean; user: any }>;
  login: (email: string, password: string) => Promise<void>;
  adminLogin: (email: string, password: string) => Promise<void>;
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to get fresh token
  const refreshToken = useCallback(async (user = currentUser) => {
    if (!user) throw new Error('No authenticated user');
    try {
      setIsRefreshing(true);
      const token = await user.getIdToken(true);
      localStorage.setItem('token', token);
      return token;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Token refresh failed:', error);
      }
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser]);

  // Create user profile via API
  const createUserProfile = async (user: any, additionalData?: any) => {
    if (!user) return;

    try {
      const token = await refreshToken(user);
      
      // Check if profile exists
      const checkResponse = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (checkResponse.ok) {
        const { data } = await checkResponse.json();
        setUserProfile(data.user);
        return;
      }

      // Set basic profile data from Firebase user
      const { displayName, email, photoURL } = user;
      const newProfile = {
        uid: user.uid,
        email,
        displayName: displayName || '',
        photoURL: photoURL || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...additionalData,
      };

      setUserProfile(newProfile);

    } catch (error) {
      if (import.meta.env.DEV) {
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
      if (import.meta.env.DEV) {
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
      if (import.meta.env.DEV) {
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

  // Admin login with custom token
  const adminLogin = async (email: string, password: string) => {
    try {
      if (import.meta.env.DEV) {
        console.log('[Auth] Initiating admin login...');
      }
      
      // Call backend admin login endpoint
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'}/api/auth/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Admin login failed');
      }

      if (import.meta.env.DEV) {
        console.log('[Auth] Admin login successful, signing in with custom token...');
      }
      
      // Sign in to Firebase with custom token
      const { user } = await signInWithCustomToken(auth, result.data.customToken);
      
      // Get and store Firebase token
      const token = await refreshToken(user);
      localStorage.setItem('token', token);
      
      // Set user profile with admin data
      setUserProfile(result.data.user);
      
      if (import.meta.env.DEV) {
        console.log('[Auth] Admin login complete');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('[Auth] Admin login error:', error);
      }
      throw new Error(error.message || 'Failed to log in as admin. Please try again.');
    }
  };

  // Sign in with Google
  const loginWithGoogle = async () => {
    try {
      if (import.meta.env.DEV) {
        console.log('[Auth] Initiating Google Sign-In...');
      }
      const result = await signInWithPopup(auth, googleProvider);
      const { user } = result;
      
      if (import.meta.env.DEV) {
        console.log('[Auth] Google Sign-In successful, getting token...');
      }
      const token = await refreshToken(user);
      localStorage.setItem('token', token);
      
      if (import.meta.env.DEV) {
        console.log('[Auth] Creating/updating user profile...');
      }
      await createUserProfile(user);
      
      if (import.meta.env.DEV) {
        console.log('[Auth] Google Sign-In complete');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
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
      if (import.meta.env.DEV) {
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
      if (import.meta.env.DEV) {
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
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'}/api/users/profile`, {
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
      setUserProfile(updatedUser);
    } catch (error) {
      if (import.meta.env.DEV) {
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
            if (!isActive || isRefreshing) return;
            try {
              const freshToken = await refreshToken(user);
              localStorage.setItem('token', freshToken);
            } catch (error) {
              if (import.meta.env.DEV) {
                console.error('Periodic token refresh failed:', error);
              }
            }
          }, 1000 * 60 * 30); // 30 minutes

          // Load user profile
          try {
            const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:5000'}/api/auth/me`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });

            if (response.ok) {
              const { data } = await response.json();
              if (isActive) setUserProfile(data.user);
            } else {
              await createUserProfile(user);
            }
          } catch (error) {
            console.error('Error loading user profile:', error);
            await createUserProfile(user);
          }
        } else {
          if (isActive) {
            setUserProfile(null);
            localStorage.removeItem('token');
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
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
  }, [refreshToken, isRefreshing]);

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
      {!loading && children}
    </AuthContext.Provider>
  );
}