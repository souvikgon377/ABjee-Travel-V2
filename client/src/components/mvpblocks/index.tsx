import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  Users,
  Activity,
  DollarSign,
  Eye,
  Database,
  TicketPercent,
  BookOpen,
  MapPin,
  FileText,
  MessageSquare,
  BarChart3,
  Settings,
  Zap,
} from 'lucide-react';
import { DashboardCard } from '@/components/ui/dashboard-card';
import { QuickActions } from '@/components/ui/quick-actions';
import { DashboardHeader, DEFAULT_FILTERS, type DashboardFilters } from '@/components/ui/dashboard-header';
import { AdminSidebar } from '@/components/ui/admin-sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { adminAPI } from '@/lib/api';
import { motion } from 'framer-motion';

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
const AdminTravelItenary = lazy(() => import('@/components/ui/travel-itenary'));
const OffersManager = lazy(() => import('@/components/ui/offers-manager').then((module) => ({ default: module.OffersManager })));
const BookingsOverview = lazy(() => import('@/components/ui/bookings-overview').then((module) => ({ default: module.BookingsOverview })));

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
    setLoading(true);
    try {
      const response = await adminAPI.getStats();
      const data = response?.data?.data ?? {};

      const totalUsers = Number(data.totalUsers ?? 0);
      const activeUsers = Number(data.activeUsers ?? 0);
      const totalRevenue = Number(data.revenue ?? 0);
      const pageViews = Number(data.pageViews ?? 0);
      const paidTxnCount = Number(data.paidTransactions ?? 0);

      setStats([
        { ...STAT_DEFAULTS[0], value: totalUsers.toLocaleString(), change: totalUsers > 0 ? `${totalUsers} registered` : '+0%' },
        { ...STAT_DEFAULTS[1], value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: paidTxnCount > 0 ? `${paidTxnCount} paid txns` : '+0%' },
        { ...STAT_DEFAULTS[2], value: activeUsers.toLocaleString(), change: activeUsers > 0 ? `${activeUsers} online` : '+0%' },
        { ...STAT_DEFAULTS[3], value: pageViews.toLocaleString(), change: pageViews > 0 ? `${pageViews} total` : '+0%', changeType: 'positive' as const },
      ]);
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.warn('Dashboard stats fetch failed:', error);
      }
      setStats(STAT_DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Poll stats every 30 seconds to get updated data
    const statsInterval = setInterval(() => {
      fetchStats().catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error polling stats:', err);
        }
      });
    }, 30000); // 30 seconds

    return () => clearInterval(statsInterval);
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
      case 'dashboard': {
        const overviewSections = [
          { title: 'Users', desc: 'Accounts, roles, and permissions', view: 'users', icon: Users, tone: 'from-blue-500 to-cyan-500' },
          { title: 'Communities', desc: 'Chat communities and moderation', view: 'chatrooms', icon: Database, tone: 'from-violet-500 to-indigo-500' },
          { title: 'Offers', desc: 'Homepage campaigns and promotions', view: 'offers', icon: TicketPercent, tone: 'from-rose-500 to-orange-500' },
          { title: 'Trip Stories', desc: 'Review and curate user stories', view: 'trip-stories', icon: BookOpen, tone: 'from-fuchsia-500 to-pink-500' },
          { title: 'Tourist Places', desc: 'Manage destination directory', view: 'tourist-places', icon: MapPin, tone: 'from-emerald-500 to-teal-500' },
          { title: 'Travel Itinerary', desc: 'Control itinerary content', view: 'travel-itinerary', icon: FileText, tone: 'from-sky-500 to-blue-500' },
          { title: 'Reviews & Comments', desc: 'Moderate platform feedback', view: 'place-feedback', icon: MessageSquare, tone: 'from-amber-500 to-orange-500' },
          { title: 'Analytics', desc: 'Growth, usage, and trends', view: 'analytics', icon: BarChart3, tone: 'from-purple-500 to-violet-500' },
          { title: 'Revenue', desc: 'Subscriptions and finance', view: 'revenue', icon: Zap, tone: 'from-green-500 to-emerald-500' },
          { title: 'Activity', desc: 'Recent platform events', view: 'activity', icon: Activity, tone: 'from-cyan-500 to-blue-500' },
          { title: 'About Page', desc: 'Homepage and about content', view: 'about-page', icon: FileText, tone: 'from-indigo-500 to-purple-500' },
          { title: 'Settings', desc: 'System controls and preferences', view: 'settings', icon: Settings, tone: 'from-slate-500 to-gray-600' },
        ] as const;

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

            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5"
            >
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Admin Overview Hub</h2>
                  <p className="text-sm text-muted-foreground">
                    One visual map of every admin area. Click any card to jump directly.
                  </p>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {overviewSections.length} sections
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {overviewSections.map((section, index) => {
                  const Icon = section.icon;
                  return (
                    <motion.button
                      key={section.view}
                      type="button"
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: index * 0.04, duration: 0.28 }}
                      onClick={() => setCurrentView(section.view)}
                      className="group rounded-xl border border-border bg-background/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`rounded-lg bg-linear-to-br ${section.tone} p-2 text-white shadow-sm`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-xs text-muted-foreground group-hover:text-primary">Open</span>
                      </div>

                      <h3 className="mt-3 text-sm font-semibold sm:text-base">{section.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{section.desc}</p>
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>

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
              </div>
            </div>
          </div>
        );
      }

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

      case 'bookings':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Bookings
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Monitor bookings and navigate quickly to booking modules.
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <BookingsOverview />
            </Suspense>
          </div>
        );

      case 'revenue':
        return (
          <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3 px-2 sm:px-0">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Revenue
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Track subscription revenue and export finance snapshots.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExport}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Export Revenue Data
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {stats.map((stat, index) => (
                <DashboardCard key={stat.title} stat={stat} index={index} />
              ))}
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
                Chat Communities Management
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Manage all chat communities, members, and moderation
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

      case 'travel-itinerary':
        return (
          <Suspense fallback={<SectionLoader />}>
            <AdminTravelItenary />
          </Suspense>
        );

      case 'offers':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Offers Management
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Create, edit, and publish animated homepage offers.
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <OffersManager />
            </Suspense>
          </div>
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

