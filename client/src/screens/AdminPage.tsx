import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminDashboard from '@/components/mvpblocks/index';

export default function AdminPage() {
  const { currentUser, userProfile, loading } = useAuth();
  const router = useRouter();
  const canAccessAdmin = userProfile?.role === 'admin' || userProfile?.role === 'owner';

  useEffect(() => {
    if (loading) return;

    // If no signed-in Firebase user, send to auth page.
    if (!currentUser) {
      router.push('/auth');
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
