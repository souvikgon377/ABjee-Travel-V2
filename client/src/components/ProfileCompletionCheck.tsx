'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { Button } from './ui/button';
import { createPortal } from 'react-dom';

export function ProfileCompletionCheck() {
  const { currentUser, userProfile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (loading || !currentUser || !userProfile) {
      setIsOpen(false);
      return;
    }

    const blocklist = ['/profile', '/auth', '/api', '/admin', '/advertisement'];
    const isBlockedPath = blocklist.some((path) => pathname.startsWith(path));
    if (isBlockedPath) {
      setIsOpen(false);
      return;
    }

    const hasIncompleteProfile =
      !userProfile.city?.trim() ||
      !userProfile.zipCode?.trim() ||
      !userProfile.country?.trim();

    const isDismissed = sessionStorage.getItem('profile-completion-dismissed') === 'true';

    if (hasIncompleteProfile && !isDismissed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
    }
  }, [currentUser, userProfile, loading, pathname]);

  const handleDismiss = () => {
    sessionStorage.setItem('profile-completion-dismissed', 'true');
    setIsOpen(false);
  };

  const handleGoToProfile = () => {
    setIsOpen(false);
    router.push('/profile');
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            className="absolute inset-0 bg-radial from-rose-500/10 via-orange-500/5 to-transparent pointer-events-none"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-2xl"
          >
            <button
              onClick={handleDismiss}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              title="Remind me later"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 dark:text-rose-400 mb-4 shadow-sm border border-rose-500/20">
                <AlertTriangle className="h-7 w-7" />
              </div>

              <h3 className="text-xl font-bold text-foreground">
                Complete Your Profile
              </h3>
              <p className="mt-2.5 text-sm text-muted-foreground leading-relaxed px-1">
                To connect in communities, explore travelers from different countries, and plan your trips seamlessly, please update your profile details.
              </p>

              <div className="mt-4 w-full rounded-2xl bg-muted p-4 border border-border text-left text-xs space-y-2">
                <p className="font-semibold text-foreground">Required fields missing:</p>
                <ul className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <span className={!userProfile?.city?.trim() ? "text-rose-500 font-bold" : "text-emerald-500 font-bold"}>
                      {!userProfile?.city?.trim() ? "✗" : "✓"}
                    </span>
                    <span>City</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className={!userProfile?.zipCode?.trim() ? "text-rose-500 font-bold" : "text-emerald-500 font-bold"}>
                      {!userProfile?.zipCode?.trim() ? "✗" : "✓"}
                    </span>
                    <span>Zip Code</span>
                  </li>
                  <li className="flex items-center gap-1.5 col-span-2">
                    <span className={!userProfile?.country?.trim() ? "text-rose-500 font-bold" : "text-emerald-500 font-bold"}>
                      {!userProfile?.country?.trim() ? "✗" : "✓"}
                    </span>
                    <span>Country</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 flex w-full flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={handleDismiss}
                  className="w-full sm:w-1/2 rounded-xl"
                >
                  Remind Me Later
                </Button>
                <Button
                  onClick={handleGoToProfile}
                  className="w-full sm:w-1/2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-[0_8px_20px_-6px_rgba(244,63,94,0.35)]"
                >
                  Go to Profile
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
