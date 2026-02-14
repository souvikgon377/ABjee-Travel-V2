import { useState, useEffect } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Users, Activity, DollarSign, Eye } from 'lucide-react';
import { DashboardCard } from '@/components/ui/dashboard-card';
import { RevenueChart } from '@/components/ui/revenue-chart';
import { UsersTable } from '@/components/ui/users-table';
import { QuickActions } from '@/components/ui/quick-actions';
import { SystemStatus } from '@/components/ui/system-status';
import { RecentActivity } from '@/components/ui/recent-activity';
import { DashboardHeader } from '@/components/ui/dashboard-header';
import { AdminSidebar } from '@/components/ui/admin-sidebar';
import { adminAPI } from '@/lib/api';

export default function AdminDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
  const fetchStats = async () => {
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
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  };

  const handleExport = () => {
    console.log('Exporting data...');
    // TODO: Implement export functionality
  };

  const handleAddUser = () => {
    console.log('Adding new user...');
    // TODO: Implement add user functionality
  };

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

  return (
    <SidebarProvider>
      <AdminSidebar />
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
            <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
              <div className="px-2 sm:px-0">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Welcome Admin
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Here&apos;s what&apos;s happening with your platform today.
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
                <div className="space-y-4 sm:space-y-6 xl:col-span-2">
                  <RevenueChart />
                  <UsersTable onAddUser={handleAddUser} />
                </div>

                {/* Sidebar Section */}
                <div className="space-y-4 sm:space-y-6">
                  <QuickActions
                    onAddUser={handleAddUser}
                    onExport={handleExport}
                  />
                  <SystemStatus />
                  <RecentActivity />
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
