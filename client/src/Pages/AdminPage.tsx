import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AdminDashboard from '@/components/mvpblocks/index';

export default function AdminPage() {
  const { userProfile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      // Check if user is authenticated and has admin role
      if (!userProfile) {
        navigate('/auth');
      } else if (userProfile.role !== 'admin') {
        // Redirect non-admin users to home
        navigate('/');
      }
    }
  }, [userProfile, loading, navigate]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Only render dashboard if user is admin
  if (!userProfile || userProfile.role !== 'admin') {
    return null;
  }

  return <AdminDashboard />;
}
