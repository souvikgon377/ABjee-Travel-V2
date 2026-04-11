import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Bell,
  Search,
  Filter,
  Download,
  RefreshCw,
  MoreHorizontal,
  X,
  CheckCheck,
  Inbox,
} from 'lucide-react';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  status: string;
  roomId?: string;
  inviteToken?: string;
};

const READ_NOTIFICATIONS_KEY = 'admin_dashboard_read_notifications';

function toDate(value: any): Date {
  if (!value) return new Date();
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?._seconds) return new Date(value._seconds * 1000);
  return new Date(value);
}

function timeAgo(createdAt: string): string {
  const timestamp = new Date(createdAt).getTime();
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(delta / 3600000);
  const days = Math.floor(delta / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function normalizeNotification(raw: any): NotificationItem {
  const created = toDate(raw?.createdAt);
  const type = String(raw?.type || 'notification');
  const status = String(raw?.status || 'pending');
  const roomName = String(raw?.roomName || '').trim();
  const isInvitation = type === 'room_invite';
  const title = isInvitation ? 'Community Invitation' : 'Notification';
  const fallbackMessage = isInvitation
    ? `You have an invitation${roomName ? ` to join community "${roomName}"` : ''}.`
    : 'You have a new platform notification.';

  return {
    id: String(raw?.id || crypto.randomUUID()),
    type,
    title,
    message: String(raw?.message || fallbackMessage),
    createdAt: created.toISOString(),
    status,
    roomId: raw?.roomId ? String(raw.roomId) : undefined,
    inviteToken: raw?.inviteToken ? String(raw.inviteToken) : undefined,
  };
}

export interface DashboardFilters {
  dateRange: '7d' | '30d' | '90d' | '1y' | 'all';
  userRole: 'all' | 'user' | 'admin' | 'moderator';
  userStatus: 'all' | 'active' | 'inactive';
  roomType: 'all' | 'public' | 'private';
}

export const DEFAULT_FILTERS: DashboardFilters = {
  dateRange: 'all',
  userRole: 'all',
  userStatus: 'all',
  roomType: 'all',
};

interface DashboardHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  isRefreshing: boolean;
  currentView: string;
  activeFilters: DashboardFilters;
  onFilterChange: (filters: DashboardFilters) => void;
}

function countActiveFilters(f: DashboardFilters, view: string): number {
  let count = 0;
  if (view === 'users') {
    if (f.userRole !== 'all') count++;
    if (f.userStatus !== 'all') count++;
  } else if (view === 'chatrooms') {
    if (f.roomType !== 'all') count++;
  } else {
    if (f.dateRange !== 'all') count++;
  }
  return count;
}

export const DashboardHeader = memo(
  ({
    searchQuery,
    onSearchChange,
    onRefresh,
    onExport,
    isRefreshing,
    currentView,
    activeFilters,
    onFilterChange,
  }: DashboardHeaderProps) => {
    const router = useRouter();
    const [filterOpen, setFilterOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationError, setNotificationError] = useState<string | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
    const activeCount = countActiveFilters(activeFilters, currentView);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
        const raw = window.localStorage.getItem(READ_NOTIFICATIONS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setReadIds(new Set(parsed.map(String)));
        }
      } catch {
        // Ignore local storage parse issues.
      }
    }, []);

    const persistReadIds = useCallback((next: Set<string>) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
    }, []);

    const fetchNotifications = useCallback(async () => {
      setNotificationLoading(true);
      setNotificationError(null);

      try {
        const [allRes, pendingRes] = await Promise.all([
          fetch('/api/notifications?limit=30'),
          fetch('/api/notifications/pending'),
        ]);

        const allJson = await allRes.json().catch(() => ({ success: false }));
        const pendingJson = await pendingRes.json().catch(() => ({ success: false }));

        const all = Array.isArray(allJson?.data) ? allJson.data : [];
        const pending = Array.isArray(pendingJson?.data) ? pendingJson.data : [];

        const byId = new Map<string, NotificationItem>();
        [...all, ...pending].forEach((raw) => {
          const item = normalizeNotification(raw);
          byId.set(item.id, item);
        });

        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNotifications(merged);
      } catch {
        setNotificationError('Could not load notifications');
      } finally {
        setNotificationLoading(false);
      }
    }, []);

    useEffect(() => {
      fetchNotifications();
    }, [fetchNotifications]);

    useEffect(() => {
      if (!notificationsOpen || notifications.length === 0) return;

      // Mark notifications currently shown as read when bell popover is opened.
      setReadIds((prev) => {
        const next = new Set(prev);
        notifications.forEach((item) => next.add(item.id));
        persistReadIds(next);
        return next;
      });
    }, [notificationsOpen, notifications, persistReadIds]);

    const unreadCount = useMemo(
      () => notifications.filter((item) => !readIds.has(item.id)).length,
      [notifications, readIds]
    );

    const markAllAsRead = useCallback(() => {
      setReadIds((prev) => {
        const next = new Set(prev);
        notifications.forEach((item) => next.add(item.id));
        persistReadIds(next);
        return next;
      });
    }, [notifications, persistReadIds]);

    const clearAllRead = useCallback(() => {
      const read = new Set(readIds);
      const nextNotifications = notifications.filter((item) => !read.has(item.id));
      setNotifications(nextNotifications);
    }, [notifications, readIds]);

    const handleNotificationClick = useCallback((item: NotificationItem) => {
      if (item.type !== 'room_invite' || !item.roomId) return;

      const roomPath = item.inviteToken
        ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
        : `/chat/room/${item.roomId}`;

      setNotificationsOpen(false);
      router.push(roomPath);
    }, [router]);

    const handleInvitationAction = useCallback(async (item: NotificationItem, action: 'accept' | 'reject') => {
      if (notificationActionId) return;
      if (item.type !== 'room_invite' || !item.roomId) return;

      setNotificationActionId(item.id);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Authentication token missing');

        const response = await fetch(`/api/notifications/${item.id}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await response.json().catch(() => ({ success: false }));
        if (!response.ok || !json?.success) {
          throw new Error(json?.message || `Failed to ${action} invitation`);
        }

        setNotifications((prev) => prev.filter((notification) => notification.id !== item.id));

        if (action === 'accept') {
          setNotificationsOpen(false);
          const roomPath = item.inviteToken
            ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
            : `/chat/room/${item.roomId}`;
          router.push(roomPath);
        }
      } finally {
        setNotificationActionId(null);
      }
    }, [notificationActionId, router]);

    const resetFilters = () => onFilterChange(DEFAULT_FILTERS);

    const FilterPopoverContent = () => (
      <div className="w-72 space-y-4 p-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filters</p>
          {activeCount > 0 && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Dashboard / Analytics: Date Range */}
        {(currentView === 'dashboard' || currentView === 'analytics' || currentView === 'activity') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Date Range</Label>
            <Select
              value={activeFilters.dateRange}
              onValueChange={(v) =>
                onFilterChange({ ...activeFilters, dateRange: v as DashboardFilters['dateRange'] })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Users: Role + Status */}
        {currentView === 'users' && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select
                value={activeFilters.userRole}
                onValueChange={(v) =>
                  onFilterChange({ ...activeFilters, userRole: v as DashboardFilters['userRole'] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select
                value={activeFilters.userStatus}
                onValueChange={(v) =>
                  onFilterChange({ ...activeFilters, userStatus: v as DashboardFilters['userStatus'] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Chatrooms: Room Type */}
        {currentView === 'chatrooms' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Community Type</Label>
            <Select
              value={activeFilters.roomType}
              onValueChange={(v) =>
                onFilterChange({ ...activeFilters, roomType: v as DashboardFilters['roomType'] })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );

    return (
      <header className="bg-background/95 sticky top-0 z-50 flex h-16 w-full shrink-0 items-center gap-2 border-b backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="capitalize">
                  {currentView === 'dashboard' ? 'Overview' : currentView}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="ml-auto flex items-center gap-2 px-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            {/* Search Input */}
            <div className="relative hidden md:block">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-64 pl-10"
              />
            </div>

            {/* Desktop Actions */}
            <div className="hidden items-center gap-2 md:flex">
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant={activeCount > 0 ? 'default' : 'outline'} size="sm" className="relative">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                    {activeCount > 0 && (
                      <Badge className="ml-2 h-4 min-w-4 rounded-full px-1 text-[10px]">
                        {activeCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="p-3">
                  <FilterPopoverContent />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className="mr-2 h-4 w-4"
                  style={isRefreshing ? { animationDuration: '0.7s' } : undefined}
                />
                Refresh
              </Button>
            </div>

            {/* Mobile Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => {
                  const input = prompt('Search dashboard:');
                  if (input) onSearchChange(input);
                }}>
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterOpen(true)}>
                  <Filter className="mr-2 h-4 w-4" />
                  Filter {activeCount > 0 && `(${activeCount})`}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRefresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-90 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-sm font-semibold">Notifications</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={fetchNotifications}
                      disabled={notificationLoading}
                    >
                      <RefreshCw
                        className="mr-1 h-3 w-3"
                        style={notificationLoading ? { animationDuration: '0.7s' } : undefined}
                      />
                      Refresh
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={markAllAsRead}
                      disabled={notifications.length === 0}
                    >
                      <CheckCheck className="mr-1 h-3 w-3" />
                      Read all
                    </Button>
                  </div>
                </div>

                <div className="max-h-85 overflow-y-auto p-2">
                  {notificationError && (
                    <p className="text-destructive px-2 py-2 text-xs">{notificationError}</p>
                  )}

                  {!notificationError && notificationLoading && notifications.length === 0 && (
                    <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
                      <RefreshCw className="h-4 w-4 animate-spin" style={{ animationDuration: '0.7s' }} />
                      Loading notifications...
                    </div>
                  )}

                  {!notificationError && !notificationLoading && notifications.length === 0 && (
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-sm">
                      <Inbox className="h-5 w-5" />
                      No notifications yet
                    </div>
                  )}

                  {notifications.map((item) => {
                    const isUnread = !readIds.has(item.id);
                    const isInvite = item.type === 'room_invite' && Boolean(item.roomId);
                    return (
                      <div
                        key={item.id}
                        className={`mb-1 rounded-md border p-2 last:mb-0 ${isInvite ? 'cursor-pointer transition-colors hover:bg-muted/60' : ''}`}
                        onClick={isInvite ? () => handleNotificationClick(item) : undefined}
                        role={isInvite ? 'button' : undefined}
                        tabIndex={isInvite ? 0 : undefined}
                        onKeyDown={isInvite ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleNotificationClick(item);
                          }
                        } : undefined}
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="text-muted-foreground text-xs">{timeAgo(item.createdAt)}</p>
                          </div>
                          {isUnread && <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />}
                        </div>
                        <p className="text-muted-foreground line-clamp-2 text-xs">{item.message}</p>
                        {isInvite && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={notificationActionId === item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInvitationAction(item, 'accept');
                              }}
                              className="inline-flex items-center rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {notificationActionId === item.id ? 'Working...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              disabled={notificationActionId === item.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInvitationAction(item, 'reject');
                              }}
                              className="inline-flex items-center rounded-md border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={clearAllRead}
                    disabled={notifications.length === 0}
                  >
                    Clear read notifications
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
        </div>
      </header>
    );
  },
);

DashboardHeader.displayName = 'DashboardHeader';
