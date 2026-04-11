"use client";

import { motion, LayoutGroup } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const navItems: NavItem[] = [
  {
    id: 'explore-interest',
    label: 'Explore Your Interest',
    href: '/chat?view=explore-interest',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 15.9l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85L12 2z" />
      </svg>
    ),
  },
  {
    id: 'trip-stories',
    label: 'Trip Stories',
    href: '/trip-stories',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5A4.5 4.5 0 003 9.5v9A2.5 2.5 0 015.5 16H12m0-9.747C13.168 5.477 14.754 5 16.5 5A4.5 4.5 0 0121 9.5v9a2.5 2.5 0 00-2.5-2.5H12" />
      </svg>
    ),
  },
  {
    id: 'travel-itineraries',
    label: 'Travel Itineraries',
    href: '/travel-itinerary',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 01.553-.894L9 2m0 18l6-3m-6 3V2m6 15l6 3m-6-3V4m6 16V8m0 0l-6-3m6 3l-6 3" />
      </svg>
    ),
  },
];

const getActiveTabFromPath = (pathname: string | null): string => {
  if (!pathname) return 'explore-interest';

  if (pathname.includes('/chat')) {
    return 'explore-interest';
  }

  if (pathname.includes('/trip-stories')) {
    return 'trip-stories';
  }

  if (pathname.includes('/travel-itinerary') || pathname.includes('/travel-destinations')) {
    return 'travel-itineraries';
  }

  return 'explore-interest';
};

const CommunityHeader: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = getActiveTabFromPath(pathname);

  const handleNavClick = (item: NavItem) => {
    router.push(item.href);
  };

  return (
    <header className="glass sticky top-16 lg:top-20 z-40 border-b border-white/25 dark:border-white/10 backdrop-blur-xl supports-backdrop-filter:bg-white/12 dark:supports-backdrop-filter:bg-black/25 shadow-[0_8px_26px_rgba(15,23,42,0.28)]">
      <div className="max-w-7xl mx-auto px-4">
        <LayoutGroup>
          <nav className="flex items-center justify-center overflow-x-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {navItems.map((item) => (
              <motion.button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`relative flex flex-col items-center justify-center px-6 py-4 min-w-36 transition-all duration-200 group ${
                  activeTab === item.id
                    ? 'text-red-600'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {activeTab === item.id && (
                  <motion.div
                    layoutId="communityActiveTab"
                    className="absolute inset-2 border-2 border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 -z-10"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}

                <div className={`mb-1 ${activeTab === item.id ? 'text-red-600 dark:text-red-500' : ''}`}>
                  {item.icon}
                </div>

                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    activeTab === item.id ? 'text-red-600 dark:text-red-500' : ''
                  }`}
                >
                  {item.label}
                </span>

                {activeTab === item.id && (
                  <motion.div
                    layoutId="communityActiveIndicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-red-600 dark:bg-red-500"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.button>
            ))}
          </nav>
        </LayoutGroup>
      </div>
    </header>
  );
};

export default CommunityHeader;