"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, ArrowRight, Shield, LogOut, Bell, RefreshCw } from 'lucide-react';
import { ModeToggle } from './mode-toggle'
import { useAuth } from '../../contexts/AuthContext';
import { resolveAvatarUrl } from '@/lib/avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface NavItem {
  name: string;
  href: string;
  hasDropdown?: boolean;
  dropdownItems?: { name: string; href: string; description?: string }[];
}

const navItems: NavItem[] = [
  { name: 'Home', href: '/' },
  // { name: 'Hotel/Hostel  Booking', href: '#hotel_booking' },
  // { name: ' Bike/Car Rentals', href: '#hotel_booking' },
  // { name: 'Customised Tour Packages', href: '#hotel_booking' },
  { name: 'Community', href: '/chat' },
  { name: 'Booking Categories', href: '/booking-categories' },
  // {
  //   name: 'Booking',
  //   href: '',
  //   hasDropdown: true,
  //   dropdownItems: [
  //     {
  //       name: 'Hotel/Hostels or Tour Packages',
  //       href: '/hotel-booking',
  //       description: '🏨✈️ Book Custom Hotel & Tour Packages in One Click',
  //     },
  //     // {
  //     //   name: 'Tour Packages',
  //     //   href: '/',
  //     //   description: 'Tour Packages with Customization',
  //     // },
      
  //     { name: 'Car Rents',
  //       href: '/car-rentals',
  //        description: 'Car Rentals' },
  //     { name: 'Bike Rents',
  //       href: '/bike-rentals',
  //        description: 'Book Your Personal Bike' },
  //   ],
  // },
  { name: 'About', href: '/about' },
  { name: 'Pricing', href: '/pricing' },
];

type NotificationItem = {
  id: string;
  type: string;
  message: string;
  status: string;
  createdAt: string;
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
});

export default function Header1() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const { currentUser, userProfile, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const profileAvatar = resolveAvatarUrl(userProfile, currentUser);
  const userDisplayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User';

  const goToProfile = () => {
    setIsMobileMenuOpen(false);
    router.push('/profile');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  const fetchNotifications = useCallback(async () => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    setNotificationLoading(true);
    setNotificationError(null);

    try {
      const token = localStorage.getItem('token');
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
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }

    fetchNotifications();
  }, [currentUser, fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.status === 'pending').length,
    [notifications]
  );
  const totalCount = notifications.length;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerVariants = {
    initial: { y: -100, opacity: 0 },
    animate: { y: 0, opacity: 1 },
  };

  const mobileMenuVariants = {
    closed: { opacity: 0, height: 0 },
    open: { opacity: 1, height: 'auto' },
  };

  const dropdownVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
  };

  return (
    <motion.header
      className={[
        'fixed left-0 right-0 top-0 z-50',
        'transition-[backdrop-filter,background-color,box-shadow] duration-300',
        isScrolled
          ? 'backdrop-blur-xl bg-white/80 dark:bg-black/80 shadow-[0_8px_32px_rgba(0,0,0,0.1)]'
          : 'backdrop-blur-none bg-transparent',
      ].join(' ')}
      variants={headerVariants}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-20">
          <motion.div
            className="flex items-center space-x-2"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                <Image
                  src="/logo.jpg"
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

          <nav className="hidden items-center space-x-8 lg:flex">
            {navItems.map((item) => (
              <div
                key={item.name}
                className="relative"
                onMouseEnter={() =>
                  item.hasDropdown && setActiveDropdown(item.name)
                }
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link href={item.href!}
                  className={[
                    'flex items-center space-x-1 font-medium transition-colors duration-200 hover:text-rose-500',
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
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-100 overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-lg"
                        variants={dropdownVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={{ duration: 0.2 }}
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

          <div className="hidden items-center space-x-4 lg:flex">
            {currentUser ? (
              <>
                {userProfile?.role === 'admin' && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Link
                      href="/admin"
                      className="inline-flex items-center space-x-2 rounded-full bg-linear-to-r from-purple-500 to-purple-700 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:shadow-lg"
                    >
                      <Shield className="h-4 w-4" />
                      <span>Admin Dashboard</span>
                    </Link>
                  </motion.div>
                )}
                <div className="flex items-center space-x-3">
                  <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted"
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
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 p-0">
                      <div className="border-b px-4 py-3">
                        <div className="flex items-center justify-between">
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
                      <div className="max-h-80 overflow-y-auto px-2 py-2">
                        {notificationError && (
                          <p className="px-2 py-2 text-xs text-destructive">{notificationError}</p>
                        )}

                        {!notificationError && notificationLoading && notifications.length === 0 && (
                          <p className="px-2 py-2 text-xs text-muted-foreground">Loading notifications...</p>
                        )}

                        {!notificationError && !notificationLoading && notifications.length === 0 && (
                          <p className="px-2 py-2 text-xs text-muted-foreground">No notifications yet.</p>
                        )}

                        {notifications.map((item) => (
                          <div
                            key={item.id}
                            className="mb-2 rounded-lg border border-border px-3 py-2"
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-medium text-foreground capitalize">
                                {item.type.replace('_', ' ')}
                              </p>
                              <span className="text-[11px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>

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
                    {profileAvatar ? (
                      <img
                        src={profileAvatar}
                        alt="Profile"
                        className="w-8 h-8 rounded-full border-2 border-rose-500"
                        loading="lazy"
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

          {/* Mobile: Theme toggle + Hamburger */}
          <div className="flex items-center space-x-2 lg:hidden">
            <ModeToggle />
            <motion.button
              className="rounded-lg p-2 transition-colors duration-200 hover:bg-muted"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              whileTap={{ scale: 0.95 }}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              className="overflow-hidden lg:hidden"
              variants={mobileMenuVariants}
              initial="closed"
              animate="open"
              exit="closed"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="mt-4 space-y-2 rounded-xl border border-border bg-background/95 py-4 shadow-xl backdrop-blur-lg">
                {navItems.map((item) => (
                  item.hasDropdown ? (
                    <div key={item.name} className="px-4 py-2">
                      <div className="font-medium text-foreground mb-2">{item.name}</div>
                      <div className="pl-4 space-y-1">
                        {item.dropdownItems?.map((dropdownItem) => (
                          <Link
                            key={dropdownItem.name}
                            href={dropdownItem.href}
                            className="block py-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-rose-500"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {dropdownItem.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={[
                        'block px-4 py-3 font-medium transition-colors duration-200',
                        isActive(item.href)
                          ? 'text-rose-500 bg-rose-500/10 rounded-lg'
                          : 'text-foreground hover:bg-muted',
                      ].join(' ')}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  )
                ))}
                <div className="space-y-2 px-4 py-2">
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
                          {profileAvatar ? (
                            <img
                              src={profileAvatar}
                              alt="Profile"
                              className="w-10 h-10 rounded-full border-2 border-rose-500"
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
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}


