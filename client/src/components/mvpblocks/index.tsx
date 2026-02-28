import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
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
      if (import.meta.env.DEV) {
        console.error('Failed to fetch stats:', error);
      }
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
  };

  const handleAddUser = () => {
    // Navigate to users section or open add user dialog
    const usersSection = document.getElementById('users');
    if (usersSection) {
      usersSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Could also open a modal here
      alert('Add User functionality: Navigate to Users management section to add new users.');
    }
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
                  <RevenueChart />
                  <div id="users">
                    <UsersTable onAddUser={handleAddUser} />
                  </div>
                </div>

                {/* Sidebar Section */}
                <div className="space-y-4 sm:space-y-6">
                  <QuickActions
                    onAddUser={handleAddUser}
                    onExport={handleExport}
                  />
                  <div id="settings">
                    <SystemStatus />
                  </div>
                  <div id="activity">
                    <RecentActivity />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
