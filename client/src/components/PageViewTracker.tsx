'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView, updateUserActivity } from '@/lib/analyticsTracker';
import { useAuth } from '@/contexts/AuthContext';

export function PageViewTracker() {
  const pathname = usePathname();
  const { currentUser } = useAuth();

  useEffect(() => {
    // Track page view
    trackPageView(pathname).catch(() => {});

    // Update user activity if logged in
    if (currentUser?.uid) {
      updateUserActivity(currentUser.uid).catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error updating user activity:', err);
        }
      });
    }
  }, [pathname, currentUser?.uid]);

  return null; // This component doesn't render anything
}
