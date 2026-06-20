import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  Users,
  Activity,
  IndianRupee,
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
  Megaphone,
} from 'lucide-react';
import { DashboardCard } from '@/components/ui/dashboard-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickActions } from '@/components/ui/quick-actions';
import { DashboardHeader, DEFAULT_FILTERS, type DashboardFilters } from '@/components/ui/dashboard-header';
import { AdminSidebar } from '@/components/ui/admin-sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { adminAPI } from '@/lib/api';
import {
  useAdminDashboardCacheStore,
  type DashboardStatsCache,
  type RevenueSettingsCache,
} from '@/lib/adminDashboardCacheStore';
import { motion } from 'framer-motion';

// ── Static stat shape (reset between fetches) ──────────────────────────────
const STAT_DEFAULTS = [
  { title: 'Total Users',      value: '0',  change: '+0%', changeType: 'positive' as const, icon: Users,       color: 'text-blue-500',   bgColor: 'bg-blue-500/10'   },
  { title: 'Revenue',          value: '₹0', change: '+0%', changeType: 'positive' as const, icon: IndianRupee,  color: 'text-green-500',  bgColor: 'bg-green-500/10'  },
  { title: 'Active Sessions',  value: '0',  change: '+0%', changeType: 'positive' as const, icon: Activity,    color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { title: 'Page Views',       value: '0',  change: '+0%', changeType: 'negative' as const, icon: Eye,         color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
];

type RevenueSettings = {
  pricing: {
    currency: string;
    proMonthly: number;
    proYearly: number;
    premiumMonthly: number;
    premiumYearly: number;
    advertizerMonthly: number;
    advertizerYearly: number;
    adMonthly: number;
    adQuarterly: number;
    adYearly: number;
  };
  privateRoomLimits: {
    pro: number;
    premium: number;
    advertizer?: number;
  };
  adLimits?: {
    monthly: number;
    quarterly: number;
    yearly: number;
  };
  adDescriptions?: {
    monthly: string;
    quarterly: string;
    yearly: string;
  };
  features?: {
    proFeatures: string;
    premiumFeatures: string;
    advertizerFeatures?: string;
    adMonthlyFeatures?: string;
    adQuarterlyFeatures?: string;
    adYearlyFeatures?: string;
  };
};

const REVENUE_SETTINGS_DEFAULTS: RevenueSettings = {
  pricing: {
    currency: 'INR',
    proMonthly: 0,
    proYearly: 0,
    premiumMonthly: 0,
    premiumYearly: 0,
    advertizerMonthly: 1000,
    advertizerYearly: 10000,
    adMonthly: 100,
    adQuarterly: 250,
    adYearly: 800,
  },
  privateRoomLimits: {
    pro: 3,
    premium: 10,
  },
  adLimits: {
    monthly: 1,
    quarterly: 3,
    yearly: -1,
  },
  adDescriptions: {
    monthly: 'Best for a single location and one basic banner.',
    quarterly: 'For businesses that want stronger visibility and more clicks.',
    yearly: 'For full brand visibility across your target area.',
  },
  features: {
    proFeatures: 'Create up to 3 private communities (monthly)\nCreate up to 10 private communities (yearly)\nUnlimited private community joining\nExpose private rooms for join requests\nPriority support',
    premiumFeatures: 'Create up to 10 private communities (monthly)\nCreate up to 20 private communities (yearly)\nUnlimited private community joining\nAdvanced member tools\nPriority assistance',
    adMonthlyFeatures: 'One live ad\nStandard placement\nEmail support',
    adQuarterlyFeatures: 'Three active ads\nFeatured placement\nPriority review',
    adYearlyFeatures: 'Unlimited campaigns\nTop placement\nDirect support',
  },
};

function buildStatsFromSnapshot(snapshot: DashboardStatsCache) {
  return [
    {
      ...STAT_DEFAULTS[0],
      value: snapshot.totalUsers.toLocaleString(),
      change: snapshot.totalUsers > 0 ? `${snapshot.totalUsers} registered` : '+0%',
    },
    {
      ...STAT_DEFAULTS[1],
      value: `₹${snapshot.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      change: snapshot.paidTxnCount > 0 ? `${snapshot.paidTxnCount} paid txns` : '+0%',
    },
    {
      ...STAT_DEFAULTS[2],
      value: snapshot.activeUsers.toLocaleString(),
      change: snapshot.activeUsers > 0 ? `${snapshot.activeUsers} online` : '+0%',
    },
    {
      ...STAT_DEFAULTS[3],
      value: snapshot.pageViews.toLocaleString(),
      change: snapshot.pageViews > 0 ? `${snapshot.pageViews} total` : '+0%',
      changeType: 'positive' as const,
    },
  ];
}

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
const ExploreInterests = lazy(() => import('@/components/ui/explore-interests'));
const ABJeeWalletAdminPanel = lazy(() => import('@/app/admin/abjee-wallet/page').then((m) => ({ default: m.default })));
const AdvertisementsManager = lazy(() => import('@/components/ui/advertisements-manager').then((module) => ({ default: module.AdvertisementsManager })));

function SectionLoader() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;
}

export default function AdminDashboard() {
  const { userProfile } = useAuth();
  const cachedStatsSnapshot = useAdminDashboardCacheStore((state) => state.stats);
  const cachedHomePageEnabled = useAdminDashboardCacheStore((state) => state.homePageEnabled);
  const cachedRevenueSettings = useAdminDashboardCacheStore((state) => state.revenueSettings);
  const cachedLastUpdatedAt = useAdminDashboardCacheStore((state) => state.lastUpdatedAt);
  const setCachedStats = useAdminDashboardCacheStore((state) => state.setStats);
  const setCachedHomePageEnabled = useAdminDashboardCacheStore((state) => state.setHomePageEnabled);
  const setCachedRevenueSettings = useAdminDashboardCacheStore((state) => state.setRevenueSettings);
  const setCachedLastUpdatedAt = useAdminDashboardCacheStore((state) => state.setLastUpdatedAt);
  const [currentView, setCurrentView] = useState('dashboard');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardRefreshVersion, setDashboardRefreshVersion] = useState(0);
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState(30);
  const [autoRefreshArmed, setAutoRefreshArmed] = useState(false);
  const [isPageActive, setIsPageActive] = useState(true);
  const [homePageEnabled, setHomePageEnabled] = useState(cachedHomePageEnabled ?? true);
  const [homePageToggleLoading, setHomePageToggleLoading] = useState(false);
  const [revenueSettings, setRevenueSettings] = useState<RevenueSettings>(
    (cachedRevenueSettings as RevenueSettings | null) ?? REVENUE_SETTINGS_DEFAULTS
  );
  const [revenueForm, setRevenueForm] = useState<RevenueSettings>(
    (cachedRevenueSettings as RevenueSettings | null) ?? REVENUE_SETTINGS_DEFAULTS
  );
  const [revenueSettingsLoading, setRevenueSettingsLoading] = useState(false);
  const [revenueSettingsSaving, setRevenueSettingsSaving] = useState(false);
  const [revenueSettingsMessage, setRevenueSettingsMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(cachedLastUpdatedAt);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showExportDialog,   setShowExportDialog]   = useState(false);
  const [usersTableRefresh, setUsersTableRefresh] = useState(0);
  const [activeFilters, setActiveFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFilterChange = useCallback((filters: DashboardFilters) => {
    setActiveFilters(filters);
  }, []);
  const [stats, setStats] = useState(
    cachedStatsSnapshot ? buildStatsFromSnapshot(cachedStatsSnapshot) : STAT_DEFAULTS
  );
  const [loading, setLoading] = useState(false);

  // Fetch all 4 sources in parallel — one failure never affects the rest
  const fetchStats = useCallback(async (options?: { withLoader?: boolean }) => {
    const withLoader = options?.withLoader ?? false;

    if (withLoader) {
      setLoading(true);
    }

    try {
      const response = await adminAPI.getStats();
      const data = response?.data?.data ?? {};

      const totalUsers = Number(data.totalUsers ?? 0);
      const activeUsers = Number(data.activeUsers ?? 0);
      const totalRevenue = Number(data.revenue ?? 0);
      const pageViews = Number(data.pageViews ?? 0);
      const paidTxnCount = Number(data.paidTransactions ?? 0);

      const snapshot: DashboardStatsCache = {
        totalUsers,
        activeUsers,
        totalRevenue,
        pageViews,
        paidTxnCount,
      };

      setStats(buildStatsFromSnapshot(snapshot));
      setCachedStats(snapshot);
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.warn('Dashboard stats fetch failed:', error);
      }
      setStats(STAT_DEFAULTS);
    } finally {
      if (withLoader) {
        setLoading(false);
      }
    }
  }, []);

  const normalizeRevenueSettings = useCallback((value: unknown): RevenueSettings => {
    const raw = value && typeof value === 'object' ? (value as Record<string, any>) : {};
    const pricing = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {};
    const limits = raw.privateRoomLimits && typeof raw.privateRoomLimits === 'object' ? raw.privateRoomLimits : {};
    const adLimits = raw.adLimits && typeof raw.adLimits === 'object' ? raw.adLimits : {};
    const adDescriptions = raw.adDescriptions && typeof raw.adDescriptions === 'object' ? raw.adDescriptions : {};
    const features = raw.features && typeof raw.features === 'object' ? raw.features : {};

    const toAmount = (candidate: unknown, fallback: number) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    const toLimit = (candidate: unknown, fallback: number) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
    };

    return {
      pricing: {
        currency: typeof pricing.currency === 'string' && pricing.currency.trim() ? pricing.currency.trim().toUpperCase() : REVENUE_SETTINGS_DEFAULTS.pricing.currency,
        proMonthly: toAmount(pricing.proMonthly, REVENUE_SETTINGS_DEFAULTS.pricing.proMonthly),
        proYearly: toAmount(pricing.proYearly, REVENUE_SETTINGS_DEFAULTS.pricing.proYearly),
        premiumMonthly: toAmount(pricing.premiumMonthly, REVENUE_SETTINGS_DEFAULTS.pricing.premiumMonthly),
        premiumYearly: toAmount(pricing.premiumYearly, REVENUE_SETTINGS_DEFAULTS.pricing.premiumYearly),
        advertizerMonthly: toAmount(pricing.advertizerMonthly, REVENUE_SETTINGS_DEFAULTS.pricing.advertizerMonthly),
        advertizerYearly: toAmount(pricing.advertizerYearly, REVENUE_SETTINGS_DEFAULTS.pricing.advertizerYearly),
        adMonthly: toAmount(pricing.adMonthly, REVENUE_SETTINGS_DEFAULTS.pricing.adMonthly),
        adQuarterly: toAmount(pricing.adQuarterly, REVENUE_SETTINGS_DEFAULTS.pricing.adQuarterly),
        adYearly: toAmount(pricing.adYearly, REVENUE_SETTINGS_DEFAULTS.pricing.adYearly),
      },
      privateRoomLimits: {
        pro: toLimit(limits.pro, REVENUE_SETTINGS_DEFAULTS.privateRoomLimits.pro),
        premium: toLimit(limits.premium, REVENUE_SETTINGS_DEFAULTS.privateRoomLimits.premium),
      },
      adLimits: {
        monthly: toLimit(adLimits.monthly, REVENUE_SETTINGS_DEFAULTS.adLimits?.monthly ?? 1),
        quarterly: toLimit(adLimits.quarterly, REVENUE_SETTINGS_DEFAULTS.adLimits?.quarterly ?? 3),
        yearly: typeof adLimits.yearly === 'number' && adLimits.yearly === -1 ? -1 : toLimit(adLimits.yearly, REVENUE_SETTINGS_DEFAULTS.adLimits?.yearly ?? -1),
      },
      adDescriptions: {
        monthly: typeof adDescriptions.monthly === 'string' && adDescriptions.monthly.trim() ? adDescriptions.monthly.trim() : REVENUE_SETTINGS_DEFAULTS.adDescriptions?.monthly || '',
        quarterly: typeof adDescriptions.quarterly === 'string' && adDescriptions.quarterly.trim() ? adDescriptions.quarterly.trim() : REVENUE_SETTINGS_DEFAULTS.adDescriptions?.quarterly || '',
        yearly: typeof adDescriptions.yearly === 'string' && adDescriptions.yearly.trim() ? adDescriptions.yearly.trim() : REVENUE_SETTINGS_DEFAULTS.adDescriptions?.yearly || '',
      },
      features: {
        proFeatures: typeof features.proFeatures === 'string' && features.proFeatures.trim() ? features.proFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.proFeatures || '',
        premiumFeatures: typeof features.premiumFeatures === 'string' && features.premiumFeatures.trim() ? features.premiumFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.premiumFeatures || '',
        advertizerFeatures: typeof features.advertizerFeatures === 'string' && features.advertizerFeatures.trim() ? features.advertizerFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.advertizerFeatures || '',
        adMonthlyFeatures: typeof features.adMonthlyFeatures === 'string' && features.adMonthlyFeatures.trim() ? features.adMonthlyFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.adMonthlyFeatures || '',
        adQuarterlyFeatures: typeof features.adQuarterlyFeatures === 'string' && features.adQuarterlyFeatures.trim() ? features.adQuarterlyFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.adQuarterlyFeatures || '',
        adYearlyFeatures: typeof features.adYearlyFeatures === 'string' && features.adYearlyFeatures.trim() ? features.adYearlyFeatures.trim() : REVENUE_SETTINGS_DEFAULTS.features?.adYearlyFeatures || '',
      },
    };
  }, []);

  const fetchHomePageSetting = useCallback(async () => {
    setRevenueSettingsLoading(true);
    try {
      const response = await adminAPI.getSettings();
      const settings = response?.data?.data;
      const enabledValue = settings?.homePageEnabled;
      setHomePageEnabled(enabledValue !== false);
      setCachedHomePageEnabled(enabledValue !== false);

      const normalizedRevenueSettings = normalizeRevenueSettings(settings);
      setRevenueSettings(normalizedRevenueSettings);
      setRevenueForm(normalizedRevenueSettings);
      setCachedRevenueSettings(normalizedRevenueSettings as RevenueSettingsCache);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load home page setting:', error);
      }
      setHomePageEnabled(true);
      setRevenueSettings(REVENUE_SETTINGS_DEFAULTS);
      setRevenueForm(REVENUE_SETTINGS_DEFAULTS);
    } finally {
      setRevenueSettingsLoading(false);
    }
  }, [normalizeRevenueSettings]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const updatePageActive = () => {
      setIsPageActive(document.visibilityState === 'visible' && document.hasFocus());
    };

    updatePageActive();
    document.addEventListener('visibilitychange', updatePageActive);
    window.addEventListener('focus', updatePageActive);
    window.addEventListener('blur', updatePageActive);

    return () => {
      document.removeEventListener('visibilitychange', updatePageActive);
      window.removeEventListener('focus', updatePageActive);
      window.removeEventListener('blur', updatePageActive);
    };
  }, []);

  // Initial fetch on component mount
  useEffect(() => {
    void Promise.all([fetchStats(), fetchHomePageSetting()]);
  }, [fetchStats, fetchHomePageSetting]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setAutoRefreshArmed(true);
    setDashboardRefreshVersion((prev) => prev + 1);

    try {
      // 1. Trigger server-side cache refresh & rewarm
      await adminAPI.refreshCache('all', true);

      // 2. Fetch fresh data for the client
      await Promise.all([fetchStats({ withLoader: true }), fetchHomePageSetting()]);
      
      const refreshedAt = Date.now();
      setLastUpdatedAt(refreshedAt);
      setCachedLastUpdatedAt(refreshedAt);
    } catch (error) {
      console.error('Failed to refresh dashboard cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchHomePageSetting, fetchStats, setCachedLastUpdatedAt]);

  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (!autoRefreshArmed || autoRefreshMinutes <= 0 || !isPageActive) {
      return;
    }

    autoRefreshTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
        void handleRefresh();
      }
    }, autoRefreshMinutes * 60000);

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefreshArmed, autoRefreshMinutes, handleRefresh, isPageActive]);

  const handleToggleHomePage = useCallback(async () => {
    setHomePageToggleLoading(true);
    const nextValue = !homePageEnabled;

    try {
      const response = await adminAPI.updateSettings({ homePageEnabled: nextValue });
      const savedValue = response?.data?.data?.homePageEnabled;
      setHomePageEnabled(savedValue !== false);
      setCachedHomePageEnabled(savedValue !== false);
    } catch (error) {
      console.error('Failed to update home page status:', error);
      alert('Unable to update Home page status. Please try again.');
    } finally {
      setHomePageToggleLoading(false);
    }
  }, [homePageEnabled]);

  const handleRevenuePricingChange = useCallback((field: keyof RevenueSettings['pricing'], value: string) => {
    setRevenueForm((prev) => {
      if (field === 'currency') {
        return {
          ...prev,
          pricing: {
            ...prev.pricing,
            currency: value.toUpperCase(),
          },
        };
      }

      const parsed = Number(value);
      return {
        ...prev,
        pricing: {
          ...prev.pricing,
          [field]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
        },
      };
    });
  }, []);

  const handleRevenueLimitChange = useCallback((field: keyof RevenueSettings['privateRoomLimits'], value: string) => {
    const parsed = Number(value);
    setRevenueForm((prev) => ({
      ...prev,
      privateRoomLimits: {
        ...prev.privateRoomLimits,
        [field]: Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0,
      },
    }));
  }, []);

  const handleFeaturesChange = useCallback((field: 'proFeatures' | 'premiumFeatures', value: string) => {
    setRevenueForm((prev) => ({
      ...prev,
      features: {
        proFeatures: prev.features?.proFeatures || '',
        premiumFeatures: prev.features?.premiumFeatures || '',
        [field]: value,
      },
    }));
  }, []);

  const handleSaveRevenueSettings = useCallback(async () => {
    setRevenueSettingsSaving(true);
    setRevenueSettingsMessage('');

    try {
      const payload = {
        pricing: {
          currency: revenueForm.pricing.currency || 'INR',
          proMonthly: Number(revenueForm.pricing.proMonthly) || 0,
          proYearly: Number(revenueForm.pricing.proYearly) || 0,
          premiumMonthly: Number(revenueForm.pricing.premiumMonthly) || 0,
          premiumYearly: Number(revenueForm.pricing.premiumYearly) || 0,
          advertizerMonthly: Number(revenueForm.pricing.advertizerMonthly) || 0,
          advertizerYearly: Number(revenueForm.pricing.advertizerYearly) || 0,
          adMonthly: Number(revenueForm.pricing.adMonthly) || 0,
          adQuarterly: Number(revenueForm.pricing.adQuarterly) || 0,
          adYearly: Number(revenueForm.pricing.adYearly) || 0,
        },
        privateRoomLimits: {
          pro: Math.max(0, Math.floor(Number(revenueForm.privateRoomLimits.pro) || 0)),
          premium: Math.max(0, Math.floor(Number(revenueForm.privateRoomLimits.premium) || 0)),
          advertizer: Math.max(0, Math.floor(Number(revenueForm.privateRoomLimits.advertizer) || 0)),
        },
        adLimits: {
          monthly: Number(revenueForm.adLimits?.monthly) || 1,
          quarterly: Number(revenueForm.adLimits?.quarterly) || 3,
          yearly: Number(revenueForm.adLimits?.yearly) || -1,
        },
        adDescriptions: {
          monthly: revenueForm.adDescriptions?.monthly || '',
          quarterly: revenueForm.adDescriptions?.quarterly || '',
          yearly: revenueForm.adDescriptions?.yearly || '',
        },
        features: {
          proFeatures: revenueForm.features?.proFeatures || '',
          premiumFeatures: revenueForm.features?.premiumFeatures || '',
          advertizerFeatures: revenueForm.features?.advertizerFeatures || '',
          adMonthlyFeatures: revenueForm.features?.adMonthlyFeatures || '',
          adQuarterlyFeatures: revenueForm.features?.adQuarterlyFeatures || '',
          adYearlyFeatures: revenueForm.features?.adYearlyFeatures || '',
        },
      };

      const response = await adminAPI.updateSettings(payload);
      const normalized = normalizeRevenueSettings(response?.data?.data);
      setRevenueSettings(normalized);
      setRevenueForm(normalized);
      setCachedRevenueSettings(normalized as RevenueSettingsCache);
      setRevenueSettingsMessage('Revenue settings saved successfully.');
    } catch (error) {
      console.error('Failed to save revenue settings:', error);
      setRevenueSettingsMessage('Failed to save revenue settings. Please try again.');
    } finally {
      setRevenueSettingsSaving(false);
    }
  }, [normalizeRevenueSettings, revenueForm]);

  const handleResetRevenueSettings = useCallback(() => {
    setRevenueForm(revenueSettings);
    setRevenueSettingsMessage('Reverted unsaved changes.');
  }, [revenueSettings]);

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
          { title: 'Advertisements', desc: 'Approve and publish ad submissions', view: 'advertisements', icon: Megaphone, tone: 'from-amber-500 to-rose-500' },
          { title: 'Trip Stories', desc: 'Review and curate user stories', view: 'trip-stories', icon: BookOpen, tone: 'from-fuchsia-500 to-pink-500' },
          { title: 'Tourist Places', desc: 'Manage destination directory', view: 'tourist-places', icon: MapPin, tone: 'from-emerald-500 to-teal-500' },
          { title: 'Explore Maps', desc: 'View destination maps and locations', view: 'maps', icon: MapPin, tone: 'from-cyan-500 to-sky-500' },
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
              whileHover={{ y: -2 }}
              className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Home Page Control</h2>
                  <p className="text-sm text-muted-foreground">
                    Turn off Home page and make Community the default landing page.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={homePageEnabled ? 'secondary' : 'destructive'}>
                    {homePageEnabled ? 'Home Live' : 'Home Off'}
                  </Badge>
                  <Button
                    type="button"
                    onClick={handleToggleHomePage}
                    disabled={homePageToggleLoading}
                    variant={homePageEnabled ? 'destructive' : 'default'}
                  >
                    {homePageToggleLoading
                      ? 'Saving...'
                      : homePageEnabled
                        ? 'Turn Off'
                        : 'Turn On'}
                  </Button>
                </div>
              </div>
            </motion.section>

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
                  <RevenueChart refreshTrigger={dashboardRefreshVersion} />
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
                    <SystemStatus refreshTrigger={dashboardRefreshVersion} />
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
                externalSearchQuery={searchQuery}
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
              <RevenueChart refreshTrigger={dashboardRefreshVersion} />
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
                  Track subscription revenue and control pricing plus private-room plan limits.
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

            <div className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">Plan Controllers</h2>
                <p className="text-sm text-muted-foreground">
                  Configure Paid and Premium plan pricing and total private communities allowed per user.
                </p>
              </div>

              {revenueSettingsLoading ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-border bg-background/70 p-4">
                      <h3 className="mb-3 text-sm font-semibold">Pricing Controller</h3>
                      <div className="space-y-3">
                        <label className="block text-xs text-muted-foreground">
                          Currency
                          <input
                            value={revenueForm.pricing.currency}
                            onChange={(event) => handleRevenuePricingChange('currency', event.target.value)}
                            maxLength={6}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="INR"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Paid (Pro) Monthly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.proMonthly}
                            onChange={(event) => handleRevenuePricingChange('proMonthly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Paid (Pro) Yearly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.proYearly}
                            onChange={(event) => handleRevenuePricingChange('proYearly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Premium Monthly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.premiumMonthly}
                            onChange={(event) => handleRevenuePricingChange('premiumMonthly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Premium Yearly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.premiumYearly}
                            onChange={(event) => handleRevenuePricingChange('premiumYearly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Advertizers Monthly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.advertizerMonthly}
                            onChange={(event) => handleRevenuePricingChange('advertizerMonthly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Advertizers Yearly
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.advertizerYearly}
                            onChange={(event) => handleRevenuePricingChange('advertizerYearly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-background/70 p-4">
                      <h3 className="mb-3 text-sm font-semibold">Private Room Controller</h3>
                      <div className="space-y-3">
                        <label className="block text-xs text-muted-foreground">
                          Max private communities a Paid (Pro) user can create
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={revenueForm.privateRoomLimits.pro}
                            onChange={(event) => handleRevenueLimitChange('pro', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Max private communities a Premium user can create
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={revenueForm.privateRoomLimits.premium}
                            onChange={(event) => handleRevenueLimitChange('premium', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Max private communities an Advertizer user can create
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={revenueForm.privateRoomLimits.advertizer}
                            onChange={(event) => handleRevenueLimitChange('advertizer', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        This controller applies to private community creation only. Joining private communities is unlimited for all users.
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-background/70 p-4">
                      <h3 className="mb-3 text-sm font-semibold">Advertisement Plan Controller</h3>
                      <div className="space-y-3">
                        <label className="block text-xs text-muted-foreground">
                          Monthly Plan Price
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.adMonthly}
                            onChange={(event) => handleRevenuePricingChange('adMonthly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Monthly Plan Ads Limit
                          <input
                            type="number"
                            min={-1}
                            step="1"
                            value={revenueForm.adLimits?.monthly ?? 1}
                            onChange={(event) => {
                              const val = Number(event.target.value);
                              setRevenueForm(prev => ({
                                ...prev,
                                adLimits: {
                                  monthly: val,
                                  quarterly: prev.adLimits?.quarterly ?? 3,
                                  yearly: prev.adLimits?.yearly ?? -1,
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Monthly Card Description
                          <input
                            value={revenueForm.adDescriptions?.monthly ?? ''}
                            onChange={(event) => {
                              const val = event.target.value;
                              setRevenueForm(prev => ({
                                ...prev,
                                adDescriptions: {
                                  monthly: val,
                                  quarterly: prev.adDescriptions?.quarterly || '',
                                  yearly: prev.adDescriptions?.yearly || '',
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Best for a single location and one basic banner."
                          />
                        </label>

                        <div className="border-t border-border my-2 pt-2" />

                        <label className="block text-xs text-muted-foreground">
                          Quarterly Plan Price
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.adQuarterly}
                            onChange={(event) => handleRevenuePricingChange('adQuarterly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Quarterly Plan Ads Limit
                          <input
                            type="number"
                            min={-1}
                            step="1"
                            value={revenueForm.adLimits?.quarterly ?? 3}
                            onChange={(event) => {
                              const val = Number(event.target.value);
                              setRevenueForm(prev => ({
                                ...prev,
                                adLimits: {
                                  monthly: prev.adLimits?.monthly ?? 1,
                                  quarterly: val,
                                  yearly: prev.adLimits?.yearly ?? -1,
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Quarterly Card Description
                          <input
                            value={revenueForm.adDescriptions?.quarterly ?? ''}
                            onChange={(event) => {
                              const val = event.target.value;
                              setRevenueForm(prev => ({
                                ...prev,
                                adDescriptions: {
                                  monthly: prev.adDescriptions?.monthly || '',
                                  quarterly: val,
                                  yearly: prev.adDescriptions?.yearly || '',
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="For businesses that want stronger visibility and more clicks."
                          />
                        </label>

                        <div className="border-t border-border my-2 pt-2" />

                        <label className="block text-xs text-muted-foreground">
                          Yearly Plan Price
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={revenueForm.pricing.adYearly}
                            onChange={(event) => handleRevenuePricingChange('adYearly', event.target.value)}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Yearly Plan Ads Limit (use -1 for unlimited)
                          <input
                            type="number"
                            min={-1}
                            step="1"
                            value={revenueForm.adLimits?.yearly ?? -1}
                            onChange={(event) => {
                              const val = Number(event.target.value);
                              setRevenueForm(prev => ({
                                ...prev,
                                adLimits: {
                                  monthly: prev.adLimits?.monthly ?? 1,
                                  quarterly: prev.adLimits?.quarterly ?? 3,
                                  yearly: val,
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          />
                        </label>

                        <label className="block text-xs text-muted-foreground">
                          Yearly Card Description
                          <input
                            value={revenueForm.adDescriptions?.yearly ?? ''}
                            onChange={(event) => {
                              const val = event.target.value;
                              setRevenueForm(prev => ({
                                ...prev,
                                adDescriptions: {
                                  monthly: prev.adDescriptions?.monthly || '',
                                  quarterly: prev.adDescriptions?.quarterly || '',
                                  yearly: val,
                                }
                              }));
                            }}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="For full brand visibility across your target area."
                          />
                        </label>
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        This controller configures the partner registration pricing plans and allowed ad limits displayed on the Advertisement page.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Features Controller</h3>
                    <div className="space-y-3">
                      <label className="block text-xs text-muted-foreground">
                        Pro Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.proFeatures || ''}
                          onChange={(event) => handleFeaturesChange('proFeatures', event.target.value)}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="Create up to 3 private communities (monthly)&#10;Create up to 10 private communities (yearly)&#10;Unlimited private community joining"
                        />
                      </label>

                      <label className="block text-xs text-muted-foreground">
                        Premium Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.premiumFeatures || ''}
                          onChange={(event) => handleFeaturesChange('premiumFeatures', event.target.value)}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="Create up to 10 private communities (monthly)&#10;Create up to 20 private communities (yearly)&#10;Unlimited private community joining"
                        />
                      </label>

                      <label className="block text-xs text-muted-foreground">
                        Advertizers Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.advertizerFeatures || ''}
                          onChange={(event) => setRevenueForm((prev) => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              proFeatures: prev.features?.proFeatures || '',
                              premiumFeatures: prev.features?.premiumFeatures || '',
                              advertizerFeatures: event.target.value,
                            },
                          }))}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="Advertisers plan: Submit ads for approval, priority placement options, analytics dashboard"
                        />
                      </label>

                      <label className="block text-xs text-muted-foreground">
                        Ad Monthly Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.adMonthlyFeatures || ''}
                          onChange={(event) => setRevenueForm((prev) => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              proFeatures: prev.features?.proFeatures || '',
                              premiumFeatures: prev.features?.premiumFeatures || '',
                              adMonthlyFeatures: event.target.value,
                            },
                          }))}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="One live ad&#10;Standard placement&#10;Email support"
                        />
                      </label>

                      <label className="block text-xs text-muted-foreground">
                        Ad Quarterly Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.adQuarterlyFeatures || ''}
                          onChange={(event) => setRevenueForm((prev) => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              proFeatures: prev.features?.proFeatures || '',
                              premiumFeatures: prev.features?.premiumFeatures || '',
                              adQuarterlyFeatures: event.target.value,
                            },
                          }))}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="Three active ads&#10;Featured placement&#10;Priority review"
                        />
                      </label>

                      <label className="block text-xs text-muted-foreground">
                        Ad Yearly Plan Features (one per line)
                        <textarea
                          value={revenueForm.features?.adYearlyFeatures || ''}
                          onChange={(event) => setRevenueForm((prev) => ({
                            ...prev,
                            features: {
                              ...prev.features,
                              proFeatures: prev.features?.proFeatures || '',
                              premiumFeatures: prev.features?.premiumFeatures || '',
                              adYearlyFeatures: event.target.value,
                            },
                          }))}
                          rows={4}
                          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                          placeholder="Unlimited campaigns&#10;Top placement&#10;Direct support"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleSaveRevenueSettings}
                      disabled={revenueSettingsSaving}
                    >
                      {revenueSettingsSaving ? 'Saving...' : 'Save Controllers'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetRevenueSettings}
                      disabled={revenueSettingsSaving}
                    >
                      Reset Unsaved
                    </Button>
                    {revenueSettingsMessage ? (
                      <span className="text-xs text-muted-foreground">{revenueSettingsMessage}</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <Suspense fallback={<SectionLoader />}>
              <RevenueChart refreshTrigger={dashboardRefreshVersion} />
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
              <RecentActivity externalSearchQuery={searchQuery} />
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
              <SystemStatus refreshTrigger={dashboardRefreshVersion} />
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
              <ChatRoomsTable externalSearchQuery={searchQuery} />
            </Suspense>
          </div>
        );

      case 'trip-stories':
        return (
          <Suspense fallback={<SectionLoader />}>
            <TripStoriesAdminPanel externalSearchQuery={searchQuery} />
          </Suspense>
        );

      case 'tourist-places':
        return (
          <Suspense fallback={<SectionLoader />}>
            <TouristPlacesManager externalSearchQuery={searchQuery} />
          </Suspense>
        );

      case 'maps':
        return (
          <Suspense fallback={<SectionLoader />}>
            <ExploreInterests showTitle={false} />
          </Suspense>
        );

      case 'travel-itinerary':
        return (
          <Suspense fallback={<SectionLoader />}>
            <AdminTravelItenary externalSearchQuery={searchQuery} />
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

      case 'advertisements':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Advertisements
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                Review pending ads, approve them, or add a new live Registration directly.
              </p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <AdvertisementsManager externalSearchQuery={searchQuery} />
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

      case 'abjee-wallet':
        return (
          <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
            <div className="px-2 sm:px-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ABJee Wallet</h1>
              <p className="text-muted-foreground text-sm sm:text-base">Manage user wallets, reset monthly caps, and top-up ABJee points.</p>
            </div>
            <Suspense fallback={<SectionLoader />}>
              <ABJeeWalletAdminPanel />
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
  }, [
    currentView,
    stats,
    userProfile,
    handleAddUser,
    handleExport,
    handleSettings,
    handleToggleHomePage,
    handleRevenuePricingChange,
    handleRevenueLimitChange,
    handleSaveRevenueSettings,
    handleResetRevenueSettings,
    homePageEnabled,
    homePageToggleLoading,
    revenueForm,
    revenueSettingsLoading,
    revenueSettingsSaving,
    revenueSettingsMessage,
    activeFilters,
    usersTableRefresh,
    searchQuery,
  ]);

  return (
    <SidebarProvider>
      <AdminSidebar currentView={currentView} onViewChange={setCurrentView} />
      <SidebarInset className="h-svh overflow-hidden">
        <DashboardHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          onExport={handleExport}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          autoRefreshMinutes={autoRefreshMinutes}
          autoRefreshArmed={autoRefreshArmed}
          onAutoRefreshMinutesChange={setAutoRefreshMinutes}
          currentView={currentView}
          activeFilters={activeFilters}
          onFilterChange={handleFilterChange}
          onViewChange={setCurrentView}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pt-0 sm:gap-4 sm:p-4">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg p-3 sm:rounded-xl sm:p-4 md:p-6" data-lenis-prevent>
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
