import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminDashboard from '@/components/mvpblocks/index';
import { getAuthRedirectHref } from '@/lib/authRedirect';

const ADMIN_PROFILE_RECOVERY_KEY = 'admin-profile-recovery-attempted';
const ADMIN_LOADING_RECOVERY_KEY = 'admin-loading-recovery-attempted';

export default function AdminPage() {
  const { currentUser, userProfile, loading } = useAuth();
  const router = useRouter();
  const canAccessAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';

  useEffect(() => {
    if (loading) return;

    // If no signed-in Firebase user, send to auth page.
    if (!currentUser) {
      router.push(getAuthRedirectHref());
      return;
    }

    // Wait until profile is available before role-based redirect.
    if (!userProfile) {
      return;
    }

    if (!canAccessAdmin) {
      router.push('/');
    }
  }, [currentUser, userProfile, loading, router, canAccessAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (loading || !currentUser || userProfile) {
      sessionStorage.removeItem(ADMIN_PROFILE_RECOVERY_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      const recoveryAttempted = sessionStorage.getItem(ADMIN_PROFILE_RECOVERY_KEY) === '1';

      if (!recoveryAttempted) {
        sessionStorage.setItem(ADMIN_PROFILE_RECOVERY_KEY, '1');
        window.location.reload();
        return;
      }

      router.replace(getAuthRedirectHref());
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [loading, currentUser, userProfile, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!loading) {
      sessionStorage.removeItem(ADMIN_LOADING_RECOVERY_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      const recoveryAttempted = sessionStorage.getItem(ADMIN_LOADING_RECOVERY_KEY) === '1';

      if (!recoveryAttempted) {
        sessionStorage.setItem(ADMIN_LOADING_RECOVERY_KEY, '1');
        window.location.reload();
        return;
      }

      router.replace(getAuthRedirectHref());
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [loading, router]);

  // Show loading while checking auth
  if (loading || (currentUser && !userProfile)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin animation-duration-[0.7s] rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Only render dashboard if user is admin/owner
  if (!userProfile || !canAccessAdmin) {
    return null;
  }

  return <AdminDashboard />;
}
