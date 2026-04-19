"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { publicAsset } from '@/lib/publicAsset';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, ArrowRight, Shield, LogOut, Bell, RefreshCw, Trash2, Inbox } from 'lucide-react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { ModeToggle } from './mode-toggle'
import { useAuth } from '../../contexts/AuthContext';
import { resolveAvatarUrl } from '@/lib/avatar';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { getSubscriptionInfo, hasPaidAccess } from '@/lib/subscriptionPolicy';

interface NavItem {
  name: string;
  href: string;
  hasDropdown?: boolean;
  dropdownItems?: { name: string; href: string; description?: string }[];
}

const navItems: NavItem[] = [
  { name: 'Home', href: '/' },
  { name: 'Community', href: '/community' },
  { name: 'Booking Categories', href: '/booking-categories' },
  { name: 'About', href: '/about' },
  { name: 'Subscription', href: '/pricing' },
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
  unreadCount?: number;
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

const normalizeNotification = (raw: any): NotificationItem => {
  const details = raw?.details && typeof raw.details === 'object'
    ? (raw.details as Record<string, unknown>)
    : undefined;
  const detailsRoomId = typeof details?.roomId === 'string' && details.roomId.trim().length > 0
    ? details.roomId.trim()
    : undefined;

  return {
    id: String(raw?.id || `${raw?.toUserId || 'notification'}-${Math.random().toString(36).slice(2)}`),
    type: String(raw?.type || 'notification'),
    message: String(raw?.message || 'You have a new notification.'),
    status: String(raw?.status || 'pending'),
    createdAt: toDate(raw?.createdAt).toISOString(),
    unreadCount: typeof raw?.unreadCount === 'number' && Number.isFinite(raw.unreadCount) && raw.unreadCount > 0
      ? Math.floor(raw.unreadCount)
      : undefined,
    roomId: raw?.roomId ? String(raw.roomId) : detailsRoomId,
    roomName: raw?.roomName ? String(raw.roomName) : undefined,
    roomVisibility: raw?.roomVisibility ? String(raw.roomVisibility) : undefined,
    inviteToken: raw?.inviteToken ? String(raw.inviteToken) : undefined,
    fromUserName: raw?.fromUserName ? String(raw.fromUserName) : undefined,
    fromUserEmail: raw?.fromUserEmail ? String(raw.fromUserEmail) : undefined,
    details,
  };
};

const getUnseenCount = (item: NotificationItem): number => {
  if (typeof item.unreadCount === 'number' && Number.isFinite(item.unreadCount) && item.unreadCount > 0) {
    return Math.floor(item.unreadCount);
  }

  const details = item.details || {};
  const detailsUnread = details.unreadCount;
  if (typeof detailsUnread === 'number' && Number.isFinite(detailsUnread) && detailsUnread > 0) {
    return Math.floor(detailsUnread);
  }

  return 1;
};

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
  const senderName =
    typeof details.senderName === 'string' && details.senderName.trim().length > 0
      ? details.senderName.trim()
      : item.fromUserName;
  const messagePreview =
    typeof details.messagePreview === 'string' && details.messagePreview.trim().length > 0
      ? details.messagePreview.trim()
      : '';
  const messagePreviews =
    Array.isArray(details.messagePreviews)
      ? details.messagePreviews.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
      : [];
  const unseenCount = getUnseenCount(item);

  const lines: string[] = [];
  if (roomName) lines.push(`Community: ${roomName}`);
  if (item.type === 'room_invite' && inviterName) lines.push(`Invited by: ${inviterName}`);
  if (item.type === 'private_room_join_request' && requesterName) lines.push(`Requested by: ${requesterName}`);
  if (item.type === 'private_room_message' && senderName) lines.push(`From: ${senderName}`);
  if (item.type === 'private_room_message') {
    lines.push(`Unseen messages: ${unseenCount}`);
    if (messagePreviews.length > 0) {
      for (const preview of messagePreviews) {
        lines.push(`Message: ${preview}`);
      }
    } else if (messagePreview) {
      lines.push(`Message: ${messagePreview}`);
    }
  }
  if (visibility) lines.push(`Visibility: ${visibility}`);
  if (item.roomId) lines.push(`Community ID: ${item.roomId}`);

  return lines;
};

const isRoomNavigableNotification = (item: NotificationItem): boolean => {
  if (!item.roomId) return false;
  return (
    item.type === 'room_invite' ||
    item.type === 'private_room_join_request' ||
    item.type === 'private_room_message'
  );
};

const formatNotificationType = (type: string): string => {
  if (type === 'private_room_join_request') return 'join request';
  if (type === 'private_room_message') return 'new message';
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
  const [homePageEnabled, setHomePageEnabled] = useState<boolean | null>(null);
  const [bookingCategoriesEnabled, setBookingCategoriesEnabled] = useState<boolean | null>(null);
  const [navSettingsResolved, setNavSettingsResolved] = useState(false);
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
  const isTravelThemePage =
    pathname?.includes('/travel-itinerary') ||
    pathname?.includes('/travel-destinations') ||
    pathname?.includes('/trip-stories') ||
    pathname?.includes('/chat') ||
    pathname?.includes('/community');
  const profileAvatar = resolveAvatarUrl(userProfile, currentUser);
  const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';
  const subscriptionInfo = useMemo(() => getSubscriptionInfo(userProfile), [userProfile]);
  const isPaidSubscriber = useMemo(() => hasPaidAccess(subscriptionInfo), [subscriptionInfo]);
  const isAdminRoute = pathname?.startsWith('/admin') === true;

  useEffect(() => {
    setProfileAvatarError(false);
  }, [profileAvatar]);

  const goToProfile = () => {
    setIsMobileMenuOpen(false);
    router.push('/profile');
  };

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : href === '/community'
        ? pathname === '/community' || pathname?.startsWith('/chat')
        : pathname?.startsWith(href);

  useEffect(() => {
    let isMounted = true;

    try {
      const cachedSettingsRaw = sessionStorage.getItem('header-public-settings');
      if (cachedSettingsRaw) {
        const cachedSettings = JSON.parse(cachedSettingsRaw) as {
          homePageEnabled?: boolean;
          bookingCategoriesEnabled?: boolean;
        };

        if (typeof cachedSettings.homePageEnabled === 'boolean') {
          setHomePageEnabled(cachedSettings.homePageEnabled);
        }

        if (typeof cachedSettings.bookingCategoriesEnabled === 'boolean') {
          setBookingCategoriesEnabled(cachedSettings.bookingCategoriesEnabled);
        }

        setNavSettingsResolved(true);
      }
    } catch {
      // Ignore cache parsing issues and fall back to network fetch.
    }

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

        const nextHomePageEnabled = settings?.homePageEnabled !== false;
        const nextBookingCategoriesEnabled = settings?.bookingCategoriesEnabled !== false;

        setHomePageEnabled(nextHomePageEnabled);
        setBookingCategoriesEnabled(nextBookingCategoriesEnabled);
        setNavSettingsResolved(true);

        try {
          sessionStorage.setItem(
            'header-public-settings',
            JSON.stringify({
              homePageEnabled: nextHomePageEnabled,
              bookingCategoriesEnabled: nextBookingCategoriesEnabled,
            })
          );
        } catch {
          // Ignore cache write issues.
        }
      } catch {
        if (isMounted) {
          setHomePageEnabled(true);
          setBookingCategoriesEnabled(true);
          setNavSettingsResolved(true);
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
      if (isAdminRoute && (item.href === '/' || item.href === '/booking-categories')) {
        return false;
      }

      if (item.href === '/') {
        return homePageEnabled === true;
      }

      if (item.href === '/booking-categories') {
        return bookingCategoriesEnabled === true;
      }

      if (!navSettingsResolved && (item.href === '/' || item.href === '/booking-categories')) {
        return false;
      }

      return true;
    }),
    [bookingCategoriesEnabled, homePageEnabled, isAdminRoute, navSettingsResolved],
  );

  const mobileNavItems = useMemo(() => visibleNavItems, [visibleNavItems]);

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

  const clearNotifications = useCallback(async () => {
    if (!currentUser || notifications.length === 0 || notificationLoading) {
      return;
    }

    setNotificationLoading(true);
    setNotificationError(null);

    try {
      const token = localStorage.getItem('token') || await currentUser.getIdToken();
      if (!token) {
        throw new Error('Authentication token missing');
      }

      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to clear notifications');
      }

      setNotifications([]);
    } catch {
      setNotificationError('Could not clear notifications');
    } finally {
      setNotificationLoading(false);
    }
  }, [currentUser, notifications.length, notificationLoading]);

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

  const clearRoomNotifications = useCallback(async (roomId?: string) => {
    if (!roomId || !currentUser) return;

    try {
      const token = localStorage.getItem('token') || await currentUser.getIdToken();
      if (!token) return;

      await fetch(`/api/notifications/room/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Navigation should not be blocked by cleanup failures.
    }
  }, [currentUser]);

  const handleNotificationClick = useCallback(async (item: NotificationItem) => {
    if (!isRoomNavigableNotification(item)) return;

    await clearRoomNotifications(item.roomId);

    const roomPath = item.inviteToken
      ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
      : `/chat/room/${item.roomId}`;

    setNotificationsOpen(false);
    setIsMobileMenuOpen(false);
    router.push(roomPath);
  }, [clearRoomNotifications, router]);

  const handleInvitationAction = useCallback(async (item: NotificationItem, action: 'accept' | 'reject') => {
    if (notificationActionId) return;
    if (!isActionableNotification(item)) return;

    setNotificationActionId(item.id);
    setNotificationError(null);
    const previousNotifications = notifications;

    // Optimistically remove the notification for instant UI feedback.
    setNotifications((prev) => prev.filter((notification) => notification.id !== item.id));

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

      if (action === 'accept' && item.type === 'room_invite') {
        await clearRoomNotifications(item.roomId);
        setNotificationsOpen(false);
        const roomPath = item.inviteToken
          ? `/chat/room/${item.roomId}?invite=${encodeURIComponent(item.inviteToken)}`
          : `/chat/room/${item.roomId}`;
        setIsMobileMenuOpen(false);
        router.push(roomPath);
      }
    } catch {
      setNotifications((prev) => {
        if (prev.some((notification) => notification.id === item.id)) return prev;
        return previousNotifications;
      });
      setNotificationError(`Could not ${action} notification`);
    } finally {
      setNotificationActionId(null);
    }
  }, [clearRoomNotifications, currentUser, notificationActionId, notifications, router]);

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
    (() => {
      const requestNotifications = notifications.filter((item) => isActionableNotification(item));
      const messageNotifications = notifications.filter((item) => !isActionableNotification(item));
      const totalMessageUnseenCount = messageNotifications.reduce((sum, item) => sum + getUnseenCount(item), 0);

      const groupedMessageNotifications = messageNotifications.reduce<Array<{ item: NotificationItem; count: number }>>((acc, item) => {
        const details = item.details || {};
        const roomId = item.roomId || (typeof details.roomId === 'string' ? details.roomId : undefined);
        const isRoomMessage = item.type === 'private_room_message' && Boolean(roomId);
        const unseenCount = getUnseenCount(item);

        if (!isRoomMessage) {
          acc.push({ item, count: unseenCount });
          return acc;
        }

        const groupKey = `private_room_message:${roomId}`;
        const existingIndex = acc.findIndex((entry) => {
          const entryDetails = entry.item.details || {};
          const entryRoomId = entry.item.roomId || (typeof entryDetails.roomId === 'string' ? entryDetails.roomId : undefined);
          return entry.item.type === 'private_room_message' && `private_room_message:${entryRoomId}` === groupKey;
        });

        if (existingIndex === -1) {
          acc.push({ item: roomId === item.roomId ? item : { ...item, roomId }, count: unseenCount });
          return acc;
        }

        const existing = acc[existingIndex];
        existing.count += unseenCount;
        if (new Date(item.createdAt).getTime() > new Date(existing.item.createdAt).getTime()) {
          existing.item = roomId === item.roomId ? item : { ...item, roomId };
        }

        return acc;
      }, []);

      groupedMessageNotifications.sort(
        (a, b) => new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime()
      );

      const renderNotificationItem = (item: NotificationItem, groupedCount: number = 1) => {
        const isInvite = item.type === 'room_invite' && Boolean(item.roomId);
        const isJoinRequest = item.type === 'private_room_join_request' && Boolean(item.roomId);
        const isNavigable = isRoomNavigableNotification(item);
        const isActionable = isActionableNotification(item);

        return (
          <motion.div
            key={item.id}
            className={`mb-2 rounded-xl border border-white/25 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/65 ${isNavigable ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-cyan-300/60 hover:bg-white/90 hover:shadow-md dark:hover:border-cyan-500/40 dark:hover:bg-slate-900/85' : ''}`}
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 46 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={isNavigable ? () => { void handleNotificationClick(item); } : undefined}
            role={isNavigable ? 'button' : undefined}
            tabIndex={isNavigable ? 0 : undefined}
            onKeyDown={isNavigable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void handleNotificationClick(item);
              }
            } : undefined}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200">
                {formatNotificationType(item.type)}
              </p>
              <div className="flex items-center gap-1.5">
                {groupedCount > 1 && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/45 dark:text-indigo-200">
                    {groupedCount} new
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-foreground/85 dark:text-slate-200/90">{item.message}</p>
            {getNotificationDetailLines(item).length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-slate-100/70 px-2 py-1.5 dark:bg-slate-800/55">
                {getNotificationDetailLines(item).map((line, lineIndex) => (
                  <p key={`${item.id}-${lineIndex}`} className="text-[11px] text-foreground/75 dark:text-slate-300/90">
                    {line}
                  </p>
                ))}
              </div>
            )}
            {isActionable && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={notificationActionId === item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleInvitationAction(item, 'accept');
                  }}
                  className="inline-flex items-center rounded-md bg-linear-to-r from-emerald-500 to-green-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="inline-flex items-center rounded-md border border-rose-300/60 bg-rose-50/80 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isInvite ? 'Reject' : 'Decline'}
                </button>
              </div>
            )}
          </motion.div>
        );
      };

      return (
    <motion.div
      data-lenis-prevent
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`${panelClassName} z-80 overflow-hidden rounded-2xl border border-cyan-300/40 bg-linear-to-br from-cyan-50/95 via-white/95 to-blue-50/95 shadow-[0_18px_50px_-20px_rgba(14,116,144,0.55)] backdrop-blur-xl dark:border-cyan-700/35 dark:from-slate-950/95 dark:via-slate-900/95 dark:to-cyan-950/70`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-36 w-36 rounded-full bg-blue-300/30 blur-3xl dark:bg-blue-500/20" />

      <div className="relative border-b border-cyan-200/60 px-4 py-3 dark:border-cyan-800/45">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notification Centre
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-medium text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200">{totalCount} total</span>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 dark:bg-rose-900/35 dark:text-rose-300">{unreadCount} unread</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchNotifications}
              className="inline-flex items-center rounded-md border border-cyan-200/70 bg-white/75 px-2 py-1 text-xs text-cyan-800 transition-all hover:bg-cyan-100 dark:border-cyan-800/60 dark:bg-slate-900/70 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
              disabled={notificationLoading}
            >
              <RefreshCw className={`mr-1 h-3 w-3 ${notificationLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void clearNotifications()}
              className="inline-flex items-center rounded-md border border-rose-200/80 bg-rose-50/80 px-2 py-1 text-xs text-rose-700 transition-all hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={notificationLoading || notifications.length === 0}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Clear
            </button>
          </div>
        </div>
      </div>

      <div data-lenis-prevent className="relative max-h-80 overflow-y-auto overscroll-contain px-2 py-2 touch-pan-y">
        {notificationError && (
          <p className="rounded-lg bg-rose-50 px-2 py-2 text-xs text-destructive dark:bg-rose-950/30">{notificationError}</p>
        )}

        {!notificationError && notificationLoading && notifications.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Loading notifications...</p>
        )}

        {!notificationError && !notificationLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Inbox className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
            No notifications yet.
          </div>
        )}

        {!notificationError && notifications.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200/70 bg-linear-to-r from-amber-50/90 to-orange-50/90 p-2 dark:border-amber-700/45 dark:from-amber-950/35 dark:to-orange-950/30">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Requests</p>
                <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/45 dark:text-amber-200">{requestNotifications.length}</span>
              </div>
              {requestNotifications.length > 0 ? (
                <AnimatePresence initial={false} mode="popLayout">
                  {requestNotifications.map((item) => renderNotificationItem(item))}
                </AnimatePresence>
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">No pending requests.</p>
              )}
            </div>

            <div className="rounded-xl border border-cyan-200/70 bg-linear-to-r from-cyan-50/85 to-blue-50/85 p-2 dark:border-cyan-700/45 dark:from-cyan-950/30 dark:to-blue-950/30">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-200">Messages</p>
                <span className="rounded-full bg-cyan-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 dark:bg-cyan-900/45 dark:text-cyan-200">{totalMessageUnseenCount}</span>
              </div>
              {messageNotifications.length > 0 ? (
                <AnimatePresence initial={false} mode="popLayout">
                  {groupedMessageNotifications.map(({ item, count }) => renderNotificationItem(item, count))}
                </AnimatePresence>
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">No message notifications.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
      );
    })()
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
          ? isTravelThemePage
            ? 'backdrop-blur-xl bg-rose-100/95 dark:bg-background/75 shadow-[0_8px_32px_rgba(0,0,0,0.18)] border-b border-rose-200/75 dark:border-border/50'
            : 'backdrop-blur-xl bg-background dark:bg-background/75 shadow-[0_8px_32px_rgba(0,0,0,0.18)] border-b border-border/50'
          : isTravelThemePage
            ? 'backdrop-blur-md bg-rose-100/80 dark:bg-background/45 border-b border-rose-200/70 dark:border-border/35'
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
              <Link
                href="/"
                className={`relative flex items-center space-x-2 rounded-xl px-1.5 py-1 ${isPaidSubscriber ? 'bg-linear-to-r from-amber-100/75 via-yellow-50/70 to-orange-100/70 dark:from-amber-900/25 dark:via-yellow-950/20 dark:to-orange-900/20' : ''}`}
              >
                {isPaidSubscriber && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-xl border border-amber-300/80 dark:border-amber-500/60"
                    animate={{
                      opacity: [0.45, 0.95, 0.45],
                      boxShadow: [
                        '0 0 0px rgba(251,191,36,0.22)',
                        '0 0 16px rgba(251,191,36,0.58)',
                        '0 0 0px rgba(251,191,36,0.22)',
                      ],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <div className="relative z-1 flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                  <Image
                    src={publicAsset('/logo.jpg')}
                    alt="ABjee Travel"
                    width={32}
                    height={32}
                    priority
                    className="h-8 w-8 object-cover"
                  />
                </div>
                <span className={`relative z-1 hidden bg-linear-to-r bg-clip-text text-xl font-bold text-transparent sm:inline ${isPaidSubscriber ? 'from-amber-500 via-orange-500 to-rose-600' : 'from-rose-500 to-rose-700'}`}>
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
                {mobileNavItems.map((item, i) => (
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
                        <div className="mb-2 font-medium text-foreground">{item.name}</div>
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
                  transition={{ delay: isMobileMenuOpen ? mobileNavItems.length * 0.06 : 0, duration: 0.25, ease: 'easeOut' }}
                >
              {currentUser ? (
                <>
                  <div className="flex items-center space-x-3 rounded-lg bg-muted px-4 py-3">
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
                          className="h-10 w-10 rounded-full border-2 border-rose-500"
                          referrerPolicy="no-referrer"
                          onError={() => setProfileAvatarError(true)}
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 font-bold text-white">
                          {userDisplayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </button>
                    <div>
                      <p className="font-medium text-foreground">{userDisplayName}</p>
                      <p className="text-xs text-muted-foreground">Welcome back!</p>
                    </div>
                  </div>
                  {userProfile?.role === 'admin' && (
                    <Link
                      href="/admin"
                      className="flex w-full items-center justify-center space-x-2 rounded-lg bg-linear-to-r from-purple-500 to-purple-700 py-2.5 text-center font-medium text-white transition-all duration-200 hover:shadow-lg"
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
                    className="flex w-full items-center justify-center space-x-2 rounded-lg border-2 border-rose-500 py-2.5 text-center font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500 hover:text-white"
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


