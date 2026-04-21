import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DashboardStatsCache {
  totalUsers: number;
  activeUsers: number;
  totalRevenue: number;
  pageViews: number;
  paidTxnCount: number;
}

export interface RevenueSettingsCache {
  pricing: {
    currency: string;
    proMonthly: number;
    proYearly: number;
    premiumMonthly: number;
    premiumYearly: number;
  };
  privateRoomLimits: {
    pro: number;
    premium: number;
  };
  features?: {
    proFeatures: string;
    premiumFeatures: string;
  };
}

interface AdminDashboardCacheState {
  stats: DashboardStatsCache | null;
  homePageEnabled: boolean | null;
  revenueSettings: RevenueSettingsCache | null;
  lastUpdatedAt: number | null;
  setStats: (stats: DashboardStatsCache) => void;
  setHomePageEnabled: (enabled: boolean) => void;
  setRevenueSettings: (settings: RevenueSettingsCache) => void;
  setLastUpdatedAt: (timestamp: number) => void;
  clearCache: () => void;
}

export const useAdminDashboardCacheStore = create<AdminDashboardCacheState>()(
  persist(
    (set) => ({
      stats: null,
      homePageEnabled: null,
      revenueSettings: null,
      lastUpdatedAt: null,
      setStats: (stats) => set({ stats }),
      setHomePageEnabled: (homePageEnabled) => set({ homePageEnabled }),
      setRevenueSettings: (revenueSettings) => set({ revenueSettings }),
      setLastUpdatedAt: (lastUpdatedAt) => set({ lastUpdatedAt }),
      clearCache: () =>
        set({
          stats: null,
          homePageEnabled: null,
          revenueSettings: null,
          lastUpdatedAt: null,
        }),
    }),
    {
      name: 'abjee-admin-dashboard-cache',
      partialize: (state) => ({
        stats: state.stats,
        homePageEnabled: state.homePageEnabled,
        revenueSettings: state.revenueSettings,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    }
  )
);
