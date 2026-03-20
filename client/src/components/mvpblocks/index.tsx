import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Users, Activity, DollarSign, Eye } from 'lucide-react';
import { DashboardCard } from '@/components/ui/dashboard-card';
import { QuickActions } from '@/components/ui/quick-actions';
import { DashboardHeader, DEFAULT_FILTERS, type DashboardFilters } from '@/components/ui/dashboard-header';
import { AdminSidebar } from '@/components/ui/admin-sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getCountFromServer, getDocs } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import { database } from '@/lib/firebase';
import { firestoreDb } from '@/lib/firebaseFirestore';

// ── Static stat shape (reset between fetches) ──────────────────────────────
const STAT_DEFAULTS = [
  { title: 'Total Users',      value: '0',  change: '+0%', changeType: 'positive' as const, icon: Users,       color: 'text-blue-500',   bgColor: 'bg-blue-500/10'   },
  { title: 'Revenue',          value: '$0', change: '+0%', changeType: 'positive' as const, icon: DollarSign,  color: 'text-green-500',  bgColor: 'bg-green-500/10'  },
  { title: 'Active Sessions',  value: '0',  change: '+0%', changeType: 'positive' as const, icon: Activity,    color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { title: 'Page Views',       value: '0',  change: '+0%', changeType: 'negative' as const, icon: Eye,         color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
];

const RevenueChart = lazy(() => import('@/components/ui/revenue-chart').then((module) => ({ default: module.RevenueChart })));
const UsersTable = lazy(() => import('@/components/ui/users-table').then((module) => ({ default: module.UsersTable })));
const ChatRoomsTable = lazy(() => import('@/components/ui/chatrooms-table').then((module) => ({ default: module.ChatRoomsTable })));
const SystemStatus = lazy(() => import('@/components/ui/system-status').then((module) => ({ default: module.SystemStatus })));
const RecentActivity = lazy(() => import('@/components/ui/recent-activity').then((module) => ({ default: module.RecentActivity })));
const AddUserDialog = lazy(() => import('@/components/ui/add-user-dialog').then((module) => ({ default: module.AddUserDialog })));
const SettingsDialog = lazy(() => import('@/components/ui/settings-dialog').then((module) => ({ default: module.SettingsDialog })));
const ExportDialog  = lazy(() => import('@/components/ui/export-dialog').then((module) => ({ default: module.ExportDialog })));
const TouristPlacesManager = lazy(() => import('@/components/ui/tourist-places').then((module) => ({ default: module.TouristPlacesManager })));
const PlaceFeedbackTable = lazy(() => import('@/components/ui/place-feedback-table').then((module) => ({ default: module.PlaceFeedbackTable })));
const AboutPageEditor = lazy(() => import('@/components/ui/about-page-editor').then((module) => ({ default: module.AboutPageEditor })));
const TripStoriesAdminPanel = lazy(() => import('@/components/ui/trip-stories-admin').then((module) => ({ default: module.TripStoriesAdminPanel })));

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
  const [showExportDialog,   setShowExportDialog]   = useState(false);
  const [usersTableRefresh, setUsersTableRefresh] = useState(0);
  const [activeFilters, setActiveFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);

  const handleFilterChange = useCallback((filters: DashboardFilters) => {
    setActiveFilters(filters);
  }, []);
  const [stats, setStats] = useState(STAT_DEFAULTS);
  const [loading, setLoading] = useState(true);

  // Fetch all 4 sources in parallel — one failure never affects the rest
  const fetchStats = useCallback(async () => {
    const prices: Record<string, number> = { basic: 9.99, pro: 19.99, premium: 29.99 };

    const [usersResult, statusResult, subsResult, pvResult] = await Promise.allSettled([
      // 1. Total Users (Firestore)
      getCountFromServer(collection(firestoreDb, 'users')),
      // 2. Active Sessions (RTDB status nodes)
      get(ref(database, 'status')),
      // 3. Revenue (Firestore subscriptions)
      getDocs(collection(firestoreDb, 'subscriptions')),
      // 4. Page Views (RTDB analytics/pageViews)
      get(ref(database, 'analytics/pageViews')),
    ]);

    // 1. Total Users
    const totalUsers = usersResult.status === 'fulfilled' ? usersResult.value.data().count : 0;
    if (usersResult.status === 'rejected' && (process.env.NODE_ENV === "development"))
      console.warn('Total users fetch failed:', usersResult.reason);

    // 2. Active Sessions
    let activeUsers = 0;
    if (statusResult.status === 'fulfilled') {
      const data = statusResult.value.val();
      if (data) {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        activeUsers = Object.values(data).filter(
          (s: any) => s?.isOnline || (s?.lastSeen && s.lastSeen > fiveMinAgo)
        ).length;
      }
    } else if ((process.env.NODE_ENV === "development")) {
      console.warn('Active sessions fetch failed:', statusResult.reason);
    }

    // 3. Revenue
    let totalRevenue = 0;
    let activeSubCount = 0;
    if (subsResult.status === 'fulfilled') {
      const now = new Date();
      subsResult.value.forEach((d) => {
        const sub = d.data();
        if (sub.status !== 'active') return;
        const endDate = sub.endDate?.toDate?.() ?? (sub.endDate ? new Date(sub.endDate) : null);
        if (!endDate || endDate > now) {
          totalRevenue += sub.plan?.price?.amount ?? prices[sub.plan?.type] ?? 0;
          activeSubCount++;
        }
      });
    } else if ((process.env.NODE_ENV === "development")) {
      console.warn('Revenue fetch failed:', subsResult.reason);
    }

    // 4. Page Views
    const pageViews = pvResult.status === 'fulfilled' ? (pvResult.value.val() || 0) : 0;
    if (pvResult.status === 'rejected' && (process.env.NODE_ENV === "development"))
      console.warn('Page views fetch failed:', pvResult.reason);

    setStats([
      { ...STAT_DEFAULTS[0], value: totalUsers.toLocaleString(),                               change: totalUsers > 0 ? `${totalUsers} registered` : '+0%' },
      { ...STAT_DEFAULTS[1], value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: activeSubCount > 0 ? `${activeSubCount} active subs` : '+0%' },
      { ...STAT_DEFAULTS[2], value: activeUsers.toLocaleString(),                              change: activeUsers > 0 ? `${activeUsers} online` : '+0%' },
      { ...STAT_DEFAULTS[3], value: pageViews.toLocaleString(),                                change: pageViews > 0 ? `${pageViews} total` : '+0%', changeType: 'positive' as const },
    ]);
    setLoading(false);
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
    setShowExportDialog(true);
  }, []);

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

  const renderView = useMemo(() => {
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
                externalRoleFilter={activeFilters.userRole}
                externalStatusFilter={activeFilters.userStatus}
              />
            </Suspense>
          </div>
        );

      case 'about-page':
        return (
          <Suspense fallback={<SectionLoader />}>
            <AboutPageEditor />
          </Suspense>
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

      case 'trip-stories':
        return (
          <Suspense fallback={<SectionLoader />}>
            <TripStoriesAdminPanel />
          </Suspense>
        );

      case 'tourist-places':
        return (
          <Suspense fallback={<SectionLoader />}>
            <TouristPlacesManager />
          </Suspense>
        );

      case 'place-feedback':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Reviews & Comments
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                View all tourist-place feedback with user details
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <PlaceFeedbackTable externalSearchQuery={searchQuery} />
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, stats, userProfile, handleAddUser, handleExport, handleSettings, activeFilters, usersTableRefresh, searchQuery]);

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
          currentView={currentView}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
        />

        <div className="flex flex-1 flex-col gap-2 p-2 pt-0 sm:gap-4 sm:p-4">
          <div className="min-h-[calc(100vh-4rem)] flex-1 rounded-lg p-3 sm:rounded-xl sm:p-4 md:p-6">
            {loading ? (
              <div className="flex h-full min-h-[60vh] items-center justify-center">
                <div className="text-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading dashboard...</p>
                </div>
              </div>
            ) : renderView}
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
          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            stats={stats.map(s => ({ title: s.title, value: s.value, change: s.change }))}
          />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}

