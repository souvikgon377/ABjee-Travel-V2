"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { publicAsset } from '@/lib/publicAsset';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, ArrowRight, Shield, LogOut, Bell, RefreshCw } from 'lucide-react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { ModeToggle } from './mode-toggle'
import { useAuth } from '../../contexts/AuthContext';
import { resolveAvatarUrl } from '@/lib/avatar';
import { firestoreDb } from '@/lib/firebaseFirestore';

interface NavItem {
  name: string;
  href: string;
  hasDropdown?: boolean;
  dropdownItems?: { name: string; href: string; description?: string }[];
}

const navItems: NavItem[] = [
  { name: 'Home', href: '/' },
  { name: 'Community', href: '/chat' },
  { name: 'Booking Categories', href: '/booking-categories' },
  { name: 'About', href: '/about' },
  { name: 'Pricing', href: '/pricing' },
];

// Move variants outside component to prevent re-creation
const headerVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

const mobileMenuVariants = {
  closed: { opacity: 0, scaleY: 0, transformOrigin: 'top' },
  open: { opacity: 1, scaleY: 1, transformOrigin: 'top' },
};

const dropdownVariants = {
  hidden: { opacity: 0, y: -10, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  status: string;
  createdAt: string;
  roomId?: string;
  roomName?: string;
  roomVisibility?: string;
  inviteToken?: string;
  fromUserName?: string;
  fromUserEmail?: string;
  details?: Record<string, unknown>;
};

const toDate = (value: any): Date => {
  if (!value) return new Date();
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?._seconds) return new Date(value._seconds * 1000);
  return new Date(value);
};

const timeAgo = (createdAt: string): string => {
  const timestamp = new Date(createdAt).getTime();
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60000);
  const hours = Math.floor(delta / 3600000);
  const days = Math.floor(delta / 86400000);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};

const normalizeNotification = (raw: any): NotificationItem => ({
  id: String(raw?.id || `${raw?.toUserId || 'notification'}-${Math.random().toString(36).slice(2)}`),
  type: String(raw?.type || 'notification'),
  message: String(raw?.message || 'You have a new notification.'),
  status: String(raw?.status || 'pending'),
  createdAt: toDate(raw?.createdAt).toISOString(),
  roomId: raw?.roomId ? String(raw.roomId) : undefined,
  roomName: raw?.roomName ? String(raw.roomName) : undefined,
  roomVisibility: raw?.roomVisibility ? String(raw.roomVisibility) : undefined,
  inviteToken: raw?.inviteToken ? String(raw.inviteToken) : undefined,
  fromUserName: raw?.fromUserName ? String(raw.fromUserName) : undefined,
  fromUserEmail: raw?.fromUserEmail ? String(raw.fromUserEmail) : undefined,
  details: raw?.details && typeof raw.details === 'object' ? (raw.details as Record<string, unknown>) : undefined,
});

const getNotificationDetailLines = (item: NotificationItem): string[] => {
  const details = item.details || {};
  const inviterName =
    typeof details.inviterName === 'string' && details.inviterName.trim().length > 0
      ? details.inviterName.trim()
      : item.fromUserName;
  const requesterName =
    typeof details.requesterName === 'string' && details.requesterName.trim().length > 0
      ? details.requesterName.trim()
      : item.fromUserName;
  const visibility =
    typeof details.roomVisibility === 'string' && details.roomVisibility.trim().length > 0
      ? details.roomVisibility.trim()
      : item.roomVisibility;
  const roomName =
    typeof details.roomName === 'string' && details.roomName.trim().length > 0
      ? details.roomName.trim()
      : item.roomName;

  const lines: string[] = [];
  if (roomName) lines.push(`Community: ${roomName}`);
  if (item.type === 'room_invite' && inviterName) lines.push(`Invited by: ${inviterName}`);
  if (item.type === 'private_room_join_request' && requesterName) lines.push(`Requested by: ${requesterName}`);
  if (visibility) lines.push(`Visibility: ${visibility}`);
  if (item.roomId) lines.push(`Community ID: ${item.roomId}`);

  return lines;
};

const isRoomNavigableNotification = (item: NotificationItem): boolean => {
  if (!item.roomId) return false;
  return item.type === 'room_invite' || item.type === 'private_room_join_request';
};

const formatNotificationType = (type: string): string => {
  if (type === 'private_room_join_request') return 'join request';
  return type.replaceAll('_', ' ');
};

const isActionableNotification = (item: NotificationItem): boolean => {
  if (!item.roomId) return false;
  return item.type === 'room_invite' || item.type === 'private_room_join_request';
};

export default function Header1() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [homePageEnabled, setHomePageEnabled] = useState(true);
  const [bookingCategoriesEnabled, setBookingCategoriesEnabled] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [profileAvatarError, setProfileAvatarError] = useState(false);
  const desktopNotificationsRef = useRef<HTMLDivElement | null>(null);
  const mobileNotificationsRef = useRef<HTMLDivElement | null>(null);
  const { currentUser, userProfile, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const profileAvatar = resolveAvatarUrl(userProfile, currentUser);
  const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';

  useEffect(() => {
    setProfileAvatarError(false);
  }, [profileAvatar]);

  const goToProfile = () => {
    setIsMobileMenuOpen(false);
    router.push('/profile');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  useEffect(() => {
    let isMounted = true;

    const loadPublicSettings = async () => {
      try {
        const response = await fetch('/api/public/settings', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        const settings = payload?.success ? payload?.data : null;

        if (!isMounted) {
          return;
        }

        setHomePageEnabled(settings?.homePageEnabled !== false);
        setBookingCategoriesEnabled(settings?.bookingCategoriesEnabled !== false);
      } catch {
        if (isMounted) {
          setHomePageEnabled(true);
          setBookingCategoriesEnabled(true);
        }
      }
    };

    loadPublicSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      if (!homePageEnabled && item.href === '/') {
        return false;
      }

      if (!bookingCategoriesEnabled && item.href === '/booking-categories') {
        return false;
      }

      return true;
    }),
    [bookingCategoriesEnabled, homePageEnabled],
  );

  const navGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(visibleNavItems.length, 1)}, minmax(120px, 1fr))`,
    }),
    [visibleNavItems.length],
  );

  const navMaxWidthClass = useMemo(() => {
    const hasBookingCategories = visibleNavItems.some((item) => item.href === '/booking-categories');
    return hasBookingCategories ? 'max-w-3xl xl:max-w-4xl' : 'max-w-2xl';
  }, [visibleNavItems]);

  const fetchNotifications = useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    setNotificationLoading(true);
    setNotificationError(null);

    try {
      const token = localStorage.getItem('token') || await currentUser.getIdToken();
      if (!token) {
        throw new Error('Authentication token missing');
      }

      const response = await fetch('/api/notifications?limit=20', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json().catch(() => ({ success: false }));

      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch notifications');
      }

      const items = Array.isArray(json?.data) ? json.data.map(normalizeNotification) : [];
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(items);
    } catch {
      setNotificationError('Could not load notifications');
    } finally {
      setNotificationLoading(false);
      setNotificationsLoaded(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setNotificationsLoaded(false);
      return;
    }

    // Load notification count in the background so the badge is visible
    // even before the notification panel is opened.
    if (!notificationsLoaded && !notificationLoading) {
      void fetchNotifications();
    }
  }, [currentUser, notificationsLoaded, notificationLoading, fetchNotifications]);

  useEffect(() => {
    if (!currentUser?.uid) {
      return;
    }

    const notificationsQuery = query(
      collection(firestoreDb, 'notifications'),
      where('toUserId', '==', currentUser.uid),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => normalizeNotification({ id: doc.id, ...doc.data() }));
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(items);
        setNotificationError(null);
        setNotificationsLoaded(true);
      },
      () => {
        // Keep API fetch as fallback if realtime listener fails.
        void fetchNotifications();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid, fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === 'pending').length,
    [notifications]
  );
  const totalCount = notifications.length;

  const handleNotificationClick = useCallback((item: NotificationItem) => {
    if (!isRoomNavigableNotification(item)) return;

    const roomPath = item.inviteToken
      ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
      : `/chat/room/${item.roomId}`;

    setNotificationsOpen(false);
    setIsMobileMenuOpen(false);
    router.push(roomPath);
  }, [router]);

  const handleInvitationAction = useCallback(async (item: NotificationItem, action: 'accept' | 'reject') => {
    if (notificationActionId) return;
    if (!isActionableNotification(item)) return;

    setNotificationActionId(item.id);
    try {
      const token = localStorage.getItem('token') || await currentUser?.getIdToken();
      if (!token) throw new Error('Authentication token missing');

      const response = await fetch(`/api/notifications/${item.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || `Failed to ${action} notification`);
      }

      setNotifications((prev) => prev.filter((notification) => notification.id !== item.id));

      if (action === 'accept' && item.type === 'room_invite') {
        setNotificationsOpen(false);
        const roomPath = item.inviteToken
          ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
          : `/chat/room/${item.roomId}`;
        setIsMobileMenuOpen(false);
        router.push(roomPath);
      }
    } finally {
      setNotificationActionId(null);
    }
  }, [currentUser, notificationActionId, router]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedDesktop = desktopNotificationsRef.current?.contains(target) ?? false;
      const clickedMobile = mobileNotificationsRef.current?.contains(target) ?? false;

      if (!clickedDesktop && !clickedMobile) {
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationsOpen]);

  const renderNotificationPanel = (panelClassName: string) => (
    <motion.div
      data-lenis-prevent
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`${panelClassName} z-80 overflow-hidden rounded-xl border border-border bg-background shadow-xl`}
    >
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Notification Centre</p>
            <p className="text-[11px] text-muted-foreground">
              {totalCount} total • {unreadCount} unread
            </p>
          </div>
          <button
            type="button"
            onClick={fetchNotifications}
            className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            disabled={notificationLoading}
          >
            <RefreshCw className={`mr-1 h-3 w-3 ${notificationLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div data-lenis-prevent className="max-h-80 overflow-y-auto overscroll-contain px-2 py-2 touch-pan-y">
        {notificationError && (
          <p className="px-2 py-2 text-xs text-destructive">{notificationError}</p>
        )}

        {!notificationError && notificationLoading && notifications.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Loading notifications...</p>
        )}

        {!notificationError && !notificationLoading && notifications.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">No notifications yet.</p>
        )}

        {notifications.map((item) => {
          const isInvite = item.type === 'room_invite' && Boolean(item.roomId);
          const isJoinRequest = item.type === 'private_room_join_request' && Boolean(item.roomId);
          const isNavigable = isRoomNavigableNotification(item);
          const isActionable = isActionableNotification(item);
          return (
            <div
              key={item.id}
              className={`mb-2 rounded-lg border border-border px-3 py-2 ${isNavigable ? 'cursor-pointer transition-colors hover:bg-muted/60' : ''}`}
              onClick={isNavigable ? () => handleNotificationClick(item) : undefined}
              role={isNavigable ? 'button' : undefined}
              tabIndex={isNavigable ? 0 : undefined}
              onKeyDown={isNavigable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNotificationClick(item);
                }
              } : undefined}
            >
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-foreground capitalize">
                  {formatNotificationType(item.type)}
                </p>
                <span className="text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{item.message}</p>
              {getNotificationDetailLines(item).length > 0 && (
                <div className="mt-2 space-y-1">
                  {getNotificationDetailLines(item).map((line) => (
                    <p key={`${item.id}-${line}`} className="text-[11px] text-foreground/80">
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {isActionable && (
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
                    {notificationActionId === item.id
                      ? 'Working...'
                      : isJoinRequest
                        ? 'Approve'
                        : 'Accept'}
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
                    {isInvite ? 'Reject' : 'Decline'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout | null = null;
    
    const handleScroll = () => {
      if (scrollTimeout) return;
      
      scrollTimeout = setTimeout(() => {
        setIsScrolled(window.scrollY > 20);
        scrollTimeout = null;
      }, 50);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, []);

  return (
    <motion.header
      className={[
        'fixed left-0 right-0 top-0 z-50',
        'transition-[backdrop-filter,background-color,box-shadow] duration-300',
        'will-change-[background-color,backdrop-filter,box-shadow,transform]',
        isScrolled
          ? 'backdrop-blur-xl bg-background dark:bg-background/75 shadow-[0_8px_32px_rgba(0,0,0,0.18)] border-b border-border/50'
          : 'backdrop-blur-md bg-background dark:bg-background/45 border-b border-border/35',
      ].join(' ')}
      variants={headerVariants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      style={{ perspective: '1000px', backfaceVisibility: 'hidden' }}
    >
      <div className="w-full px-3 sm:px-5 lg:px-6 xl:px-8">
        <div className="relative flex h-16 items-center lg:h-20">
          <div className="flex shrink-0 items-center gap-4">
            <motion.div
              className="flex items-center space-x-2"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            >
              <Link href="/" className="flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                  <Image
                    src={publicAsset('/logo.jpg')}
                    alt="ABjee Travel"
                    width={32}
                    height={32}
                    priority
                    className="h-8 w-8 object-cover"
                  />
                </div>
                <span className="hidden bg-linear-to-r from-rose-500 to-rose-700 bg-clip-text text-xl font-bold text-transparent sm:inline">
                  ABjee Travel
                </span>
              </Link>
            </motion.div>

            {currentUser && userProfile?.role === 'admin' && (
              <motion.div
                className="hidden lg:block"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  href="/admin"
                  className="inline-flex items-center space-x-2 rounded-full bg-linear-to-r from-purple-500 to-purple-700 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-lg"
                >
                  <Shield className="h-4 w-4" />
                  <span>Admin Dashboard</span>
                </Link>
              </motion.div>
            )}
          </div>

          <nav
            className={`absolute left-1/2 top-1/2 hidden w-full -translate-x-1/2 -translate-y-1/2 items-center lg:grid ${navMaxWidthClass}`}
            style={navGridStyle}
          >
            {visibleNavItems.map((item) => (
              <div
                key={item.name}
                className="relative flex justify-center"
                onMouseEnter={() =>
                  item.hasDropdown && setActiveDropdown(item.name)
                }
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link href={item.href!}
                  className={[
                    'flex items-center space-x-1 whitespace-nowrap font-medium transition-colors duration-200 hover:text-rose-500',
                    isActive(item.href) ? 'text-rose-500' : 'text-foreground',
                  ].join(' ')}
                >
                  <span>{item.name}</span>
                  {item.hasDropdown && (
                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                  )}
                </Link>
                

                {item.hasDropdown && (
                  <AnimatePresence>
                    {activeDropdown === item.name && (
                      <motion.div
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-100 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-lg will-change-[transform,opacity]"
                        variants={dropdownVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        {item.dropdownItems?.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.name}
                            href={dropdownItem.href}
                            className="block px-4 py-3 transition-colors duration-200 hover:bg-muted"
                            onClick={() => setActiveDropdown(null)}
                          >
                            <div className="font-medium text-foreground">
                              {dropdownItem.name}
                            </div>
                            {dropdownItem.description && (
                              <div className="text-sm text-muted-foreground">
                                {dropdownItem.description}
                              </div>
                            )}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            ))}
          </nav>

          <div className="ml-auto hidden items-center space-x-3 lg:flex">
            {currentUser ? (
              <>
                <div className="flex items-center space-x-3">
                  <div className="relative" ref={desktopNotificationsRef}>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen((open) => !open)}
                      className="relative z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted active:scale-95 touch-manipulation pointer-events-auto"
                      aria-label="Open notifications"
                      title="Notifications"
                    >
                      <Bell className="h-4 w-4" />
                      {totalCount > 0 && (
                        <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                          {totalCount > 9 ? '9+' : totalCount}
                        </span>
                      )}
                    </button>
                    <AnimatePresence>
                      {notificationsOpen && renderNotificationPanel('absolute right-0 top-full mt-2 w-80 origin-top-right')}
                    </AnimatePresence>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {userDisplayName}
                    </p>
                    <p className="text-xs text-muted-foreground">Welcome back!</p>
                  </div>
                  <button
                    type="button"
                    onClick={goToProfile}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                    aria-label="Open profile"
                    title="Open profile"
                  >
                    {profileAvatar && !profileAvatarError ? (
                      <img
                        src={profileAvatar}
                        alt="Profile"
                        className="w-8 h-8 rounded-full border-2 border-rose-500"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setProfileAvatarError(true)}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-rose-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {userDisplayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                </div>
                <motion.button
                  onClick={() => {
                    logout();
                    router.push('/');
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center space-x-2 rounded-full border-2 border-rose-500 px-4 py-2 text-sm font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </motion.button>
              </>
            ) : (
              <>
                <Link
                  href="/auth"
                  className="font-medium text-foreground transition-colors duration-200 hover:text-rose-500"
                >
                  Sign In
                </Link>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Link
                    href="/auth"
                    className="inline-flex items-center space-x-2 rounded-full bg-linear-to-r from-rose-500 to-rose-700 px-6 py-2.5 font-medium text-white transition-all duration-200 hover:shadow-lg"
                  >
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </>
            )}
            <ModeToggle />
          </div>

          {/* Mobile: Notifications + Theme toggle + Hamburger */}
          <div className="ml-auto flex items-center space-x-2 lg:hidden">
            {currentUser && (
              <div className="relative" ref={mobileNotificationsRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  className="relative z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted active:scale-95 touch-manipulation pointer-events-auto"
                  aria-label="Open notifications"
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {totalCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                      {totalCount > 9 ? '9+' : totalCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {notificationsOpen && renderNotificationPanel('fixed left-1/2 top-[4.5rem] w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 origin-top')}
                </AnimatePresence>
              </div>
            )}
            <ModeToggle />
            <button
              className="rounded-lg p-2 transition-colors duration-200 hover:bg-muted active:scale-95"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              className="overflow-hidden lg:hidden will-change-[transform,opacity]"
              variants={mobileMenuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              transition={{ duration: 0.28, ease: 'easeInOut' }}
            >
              <div className="mt-2 space-y-1 rounded-xl border border-border bg-background/95 py-3 shadow-xl backdrop-blur-lg">
                {visibleNavItems.map((item, i) => (
                  <motion.div
                    key={item.name}
                    custom={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={isMobileMenuOpen ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                    transition={{ delay: isMobileMenuOpen ? i * 0.06 : 0, duration: 0.25, ease: 'easeOut' }}
                    className="will-change-[transform,opacity]"
                  >
                    {item.hasDropdown ? (
                      <div className="px-4 py-2">
                        <div className="font-medium text-foreground mb-2">{item.name}</div>
                        <div className="pl-4 space-y-1">
                          {item.dropdownItems?.map((dropdownItem) => (
                            <Link
                              key={dropdownItem.name}
                              href={dropdownItem.href}
                              className="block py-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-rose-500"
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              {dropdownItem.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        className={[
                          'block px-4 py-3 font-medium transition-colors duration-150',
                          isActive(item.href)
                            ? 'text-rose-500 bg-rose-500/10 rounded-lg'
                            : 'text-foreground hover:bg-muted',
                        ].join(' ')}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    )}
                  </motion.div>
                ))}
                <motion.div
                  className="space-y-2 px-4 py-2 will-change-[transform,opacity]"
                  initial={{ opacity: 0, x: -20 }}
                  animate={isMobileMenuOpen ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ delay: isMobileMenuOpen ? visibleNavItems.length * 0.06 : 0, duration: 0.25, ease: 'easeOut' }}
                >
                  {currentUser ? (
                    <>
                      <div className="flex items-center space-x-3 px-4 py-3 bg-muted rounded-lg">
                        <button
                          type="button"
                          onClick={goToProfile}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                          aria-label="Open profile"
                          title="Open profile"
                        >
                          {profileAvatar && !profileAvatarError ? (
                            <img
                              src={profileAvatar}
                              alt="Profile"
                              className="w-10 h-10 rounded-full border-2 border-rose-500"
                              referrerPolicy="no-referrer"
                              onError={() => setProfileAvatarError(true)}
                            />
                          ) : (
                            <div className="w-10 h-10 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold">
                              {userDisplayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </button>
                        <div>
                          <p className="font-medium text-foreground">
                            {userDisplayName}
                          </p>
                          <p className="text-xs text-muted-foreground">Welcome back!</p>
                        </div>
                      </div>
                      {userProfile?.role === 'admin' && (
                        <Link
                          href="/admin"
                          className="flex items-center justify-center space-x-2 w-full rounded-lg bg-linear-to-r from-purple-500 to-purple-700 py-2.5 text-center font-medium text-white transition-all duration-200 hover:shadow-lg"
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <Shield className="h-4 w-4" />
                          <span>Admin Dashboard</span>
                        </Link>
                      )}
                      <button
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          logout();
                          router.push('/');
                        }}
                        className="flex items-center justify-center space-x-2 w-full rounded-lg border-2 border-rose-500 py-2.5 text-center font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500 hover:text-white"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Logout</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/auth"
                        className="block w-full rounded-lg py-2.5 text-center font-medium text-foreground transition-colors duration-200 hover:bg-muted"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/auth"
                        className="block w-full rounded-lg bg-linear-to-r from-rose-500 to-rose-700 py-2.5 text-center font-medium text-white transition-all duration-200 hover:shadow-lg"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        Get Started
                      </Link>
                    </>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}


