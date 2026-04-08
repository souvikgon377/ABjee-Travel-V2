import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthMultiStepForm from '../components/auth/AuthMultiStepForm';
import Header from '../components/mvpblocks/header-1';
import { Button } from '../components/ui/button';
import { LogOut, User } from 'lucide-react';
import { resolveAvatarUrl } from '@/lib/avatar';

export default function AuthPage() {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const { currentUser, userProfile, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canAccessAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';
  const profileAvatar = resolveAvatarUrl(userProfile, currentUser);

  useEffect(() => {
    setProfileAvatarError(false);
  }, [profileAvatar]);

  useEffect(() => {
    if (currentUser && canAccessAdmin) {
      router.replace('/admin');
    }
  }, [currentUser, canAccessAdmin, router]);

  const handleAuthComplete = () => {
    // Check if user has admin role and redirect to admin dashboard
    if (canAccessAdmin) {
      router.push('/admin');
      return;
    }
    
    // Get the intended destination from query param, or fallback to chat page
    const from = searchParams.get('from') || '/chat';
    router.push(from);
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Failed to log out:', error);
      }
      // Silently handle logout errors - user can retry
    }
  };

  if (currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="container mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 text-center"
          >
            <div className="mb-6">
              {profileAvatar && !profileAvatarError ? (
                <img
                  src={profileAvatar}
                  alt="Profile"
                  className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-blue-500"
                  referrerPolicy="no-referrer"
                  onError={() => setProfileAvatarError(true)}
                />
              ) : (
                <div className="w-20 h-20 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <User className="w-10 h-10 text-white" />
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome back!
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {userProfile?.displayName || currentUser.email}
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={() => router.push(canAccessAdmin ? '/admin' : '/chat')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {canAccessAdmin ? 'Go to Admin Dashboard' : 'Go to Community Chat'}
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="container mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {mode === 'signup' ? 'Join ABjee Travel' : 'Welcome Back'}
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
            {mode === 'signup' 
              ? 'Create your account and start connecting with fellow travelers'
              : 'Sign in to access your account and continue your journey'
            }
          </p>

          {/* Mode Toggle */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-1 flex">
              <button
                onClick={() => setMode('signup')}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => setMode('login')}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
            </div>
          </div>
        </motion.div>

        {/* Auth Form */}
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: mode === 'signup' ? 50 : -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-center"
        >
          <AuthMultiStepForm
            mode={mode}
            onComplete={handleAuthComplete}
            className="w-full max-w-md"
          />
        </motion.div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center mt-12"
        >
          <div className="max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Why Join ABjee Travel?
            </h3>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div className="p-4">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🌍</span>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Connect Globally</h4>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Meet fellow travelers from around the world and share experiences
                </p>
              </div>
              <div className="p-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🤝</span>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Find Travel Partners</h4>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Discover like-minded travelers for your next adventure
                </p>
              </div>
              <div className="p-4">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💬</span>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Real-time Chat</h4>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Join conversations and get instant travel advice
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

