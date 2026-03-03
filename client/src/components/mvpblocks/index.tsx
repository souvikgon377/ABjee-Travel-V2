import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Users, Activity, DollarSign, Eye } from 'lucide-react';
import { DashboardCard } from '@/components/ui/dashboard-card';
import { QuickActions } from '@/components/ui/quick-actions';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { AdminSidebar } from '@/components/ui/admin-sidebar';
import { adminAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const RevenueChart = lazy(() => import('@/components/ui/revenue-chart').then((module) => ({ default: module.RevenueChart })));
const UsersTable = lazy(() => import('@/components/ui/users-table').then((module) => ({ default: module.UsersTable })));
const ChatRoomsTable = lazy(() => import('@/components/ui/chatrooms-table').then((module) => ({ default: module.ChatRoomsTable })));
const SystemStatus = lazy(() => import('@/components/ui/system-status').then((module) => ({ default: module.SystemStatus })));
const RecentActivity = lazy(() => import('@/components/ui/recent-activity').then((module) => ({ default: module.RecentActivity })));
const AddUserDialog = lazy(() => import('@/components/ui/add-user-dialog').then((module) => ({ default: module.AddUserDialog })));
const SettingsDialog = lazy(() => import('@/components/ui/settings-dialog').then((module) => ({ default: module.SettingsDialog })));

function SectionLoader() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;
}

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [usersTableRefresh, setUsersTableRefresh] = useState(0);
  const [stats, setStats] = useState([
    {
      title: 'Total Users',
      value: '0',
      change: '+0%',
      changeType: 'positive' as const,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Revenue',
      value: '$0',
      change: '+0%',
      changeType: 'positive' as const,
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Active Sessions',
      value: '0',
      change: '+0%',
      changeType: 'positive' as const,
      icon: Activity,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Page Views',
      value: '0',
      change: '+0%',
      changeType: 'negative' as const,
      icon: Eye,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ]);
  const [loading, setLoading] = useState(true);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await adminAPI.getStats();
      const data = response.data.data;

      setStats([
        {
          title: 'Total Users',
          value: data.totalUsers.toLocaleString(),
          change: `+${data.stats.users.growth}%`,
          changeType: 'positive' as const,
          icon: Users,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
        },
        {
          title: 'Revenue',
          value: `$${parseFloat(data.revenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          change: `+${data.stats.revenue.growth}%`,
          changeType: parseFloat(data.stats.revenue.growth) >= 0 ? 'positive' as const : 'negative' as const,
          icon: DollarSign,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
        },
        {
          title: 'Active Users',
          value: data.activeUsers.toLocaleString(),
          change: `${data.activeSubscriptions} subs`,
          changeType: 'positive' as const,
          icon: Activity,
          color: 'text-purple-500',
          bgColor: 'bg-purple-500/10',
        },
        {
          title: 'Page Views',
          value: data.pageViews.toLocaleString(),
          change: '+5.2%',
          changeType: 'positive' as const,
          icon: Eye,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
        },
      ]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch stats:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  }, [fetchStats]);

  const handleExport = useCallback(() => {
    try {
      // Export dashboard data as JSON
      const exportData = {
        exportDate: new Date().toISOString(),
        stats: stats.map(s => ({ title: s.title, value: s.value, change: s.change })),
        timestamp: Date.now()
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `abjee-travel-dashboard-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      if (import.meta.env.DEV) {
        console.log('Dashboard data exported successfully');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    }
  }, [stats]);

  const handleAddUser = useCallback(() => {
    // Open the Add User dialog
    setShowAddUserDialog(true);
  }, []);

  const handleSettings = useCallback(() => {
    // Open the Settings dialog
    setShowSettingsDialog(true);
  }, []);

  const handleUserAdded = useCallback(() => {
    // Refresh stats after adding a user
    fetchStats();
    // Trigger users table refresh
    setUsersTableRefresh(prev => prev + 1);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome, {userProfile?.displayName || userProfile?.email || 'Admin'}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Here&apos;s what&apos;s happening with ABjee Travel platform today.
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {stats.map((stat, index) => (
                <DashboardCard key={stat.title} stat={stat} index={index} />
              ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
              {/* Charts Section */}
              <div id="analytics" className="space-y-4 sm:space-y-6 xl:col-span-2">
                <Suspense fallback={<SectionLoader />}>
                  <RevenueChart />
                </Suspense>
              </div>

              {/* Sidebar Section */}
              <div className="space-y-4 sm:space-y-6">
                <QuickActions
                  onAddUser={handleAddUser}
                  onExport={handleExport}
                  onSettings={handleSettings}
                  onViewChange={setCurrentView}
                />
                <div id="settings">
                  <Suspense fallback={<SectionLoader />}>
                    <SystemStatus />
                  </Suspense>
                </div>
                <div id="activity">
                  <Suspense fallback={<SectionLoader />}>
                    <RecentActivity />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        );

      case 'users':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                User Management
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Manage all users, roles, and permissions
              </p>
            </div>

            <Suspense fallback={<SectionLoader />}>
              <UsersTable
                onAddUser={handleAddUser}
                refreshTrigger={usersTableRefresh}
              />
            </Suspense>
          </div>
        );

      case 'analytics':
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Analytics
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                View detailed analytics and insights
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <RevenueChart />
            </Suspense>
          </div>
        );

      case 'activity':
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Recent Activity
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Monitor platform activity and user actions
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <RecentActivity />
            </Suspense>
          </div>
        );

      case 'settings':
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                System Settings
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Configure system preferences and options
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <SystemStatus />
            </Suspense>
            <div className="mt-6">
              <button
                onClick={handleSettings}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Open Settings
              </button>
            </div>
          </div>
        );

      case 'chatrooms':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Chat Rooms Management
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Manage all chat rooms, members, and moderation
              </p>
            </div>

            <Suspense fallback={<SectionLoader />}>
              <ChatRoomsTable />
            </Suspense>
          </div>
        );

      default:
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                This section is coming soon...
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <SidebarProvider>
      <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset>
        <DashboardHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          onExport={handleExport}
          isRefreshing={isRefreshing}
        />

        <div className="flex flex-1 flex-col gap-2 p-2 pt-0 sm:gap-4 sm:p-4">
          <div className="min-h-[calc(100vh-4rem)] flex-1 rounded-lg p-3 sm:rounded-xl sm:p-4 md:p-6">
            {renderView()}
          </div>
        </div>

        {/* Dialogs */}
        <Suspense fallback={null}>
          <AddUserDialog
            open={showAddUserDialog}
            onOpenChange={setShowAddUserDialog}
            onUserAdded={handleUserAdded}
          />
          <SettingsDialog
            open={showSettingsDialog}
            onOpenChange={setShowSettingsDialog}
          />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
