"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';

interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    isNew?: boolean;
    href?: string;
}

const Header2: React.FC = () => {
    const [activeTab, setActiveTab] = useState('packages');
    const [bookingCategoriesEnabled, setBookingCategoriesEnabled] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    const navItems: NavItem[] = [
         {
            id: 'packages',
            label: 'Holiday Packages',
            href: '/booking-categories',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
        {
            id: 'hotels',
            label: 'Hotels/Hostels',
            href: '/hotel-list',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
        },
        // {
        //     id: 'homestays',
        //     label: 'Homestays & Villas',
        //     href: '/hotel-booking',
        //     icon: (
        //         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        //         </svg>
        //     ),
        // },
       
        // {
        //     id: 'trains',
        //     label: 'Trains',
        //     icon: (
        //         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        //             <rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" strokeWidth={1.5} fill="none"/>
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 18h.01M15 18h.01M6 14h12" />
        //         </svg>
        //     ),
        // },
        {
            id: 'car-rentals',
            label: 'Car Rentals',
            href: '/car-rental',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
            ),
            isNew: true,
        },
        {
            id: 'bike-rentals',
            label: 'Bike Rentals',
            href: '/bike-rental',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 17a3 3 0 100-6 3 3 0 000 6zm14 0a3 3 0 100-6 3 3 0 000 6zM5 14h4l2-4 3 6 2-2h3" />
                </svg>
            ),
            isNew: true,
        },
        {
            id: 'cabs',
            label: 'Cabs',
            href: '/cab-booking',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 17h.01M16 17h.01M6 11h12M5 17h14a2 2 0 002-2V9a2 2 0 00-2-2h-1l-1-3H7L6 7H5a2 2 0 00-2 2v6a2 2 0 002 2zm0 0v2m14-2v2" />
                </svg>
            ),
        },
        {
            id: 'buses',
            label: 'Buses',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h8M8 11h8M6 18h.01M18 18h.01M4 15V7a4 4 0 014-4h8a4 4 0 014 4v8a2 2 0 01-2 2H6a2 2 0 01-2-2zm0 0v2a1 1 0 001 1h1m14-3v2a1 1 0 01-1 1h-1" />
                </svg>
            ),
        },
        // {
        //     id: 'flights',
        //     label: 'Flights',
        //     icon: (
        //         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        //         </svg>
        //     ),
        // },
        
        
        // {
        //     id: 'tours',
        //     label: 'Tours & Attractions',
        //     icon: (
        //         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        //             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        //         </svg>
        //     ),
        //     isNew: true,
        // },
    ];

    useEffect(() => {
        let isMounted = true;

        const loadBookingCategoriesSetting = async () => {
            try {
                const settingsRef = doc(firestoreDb, 'admin_settings', 'system');
                const snapshot = await getDoc(settingsRef);
                const enabledValue = snapshot.exists() ? snapshot.data()?.bookingCategoriesEnabled : true;

                if (!isMounted) {
                    return;
                }

                setBookingCategoriesEnabled(enabledValue !== false);
            } catch {
                if (isMounted) {
                    setBookingCategoriesEnabled(true);
                }
            }
        };

        loadBookingCategoriesSetting();

        return () => {
            isMounted = false;
        };
    }, []);

    const visibleNavItems = useMemo(
        () => navItems.filter((item) => bookingCategoriesEnabled || item.href !== '/booking-categories'),
        [bookingCategoriesEnabled],
    );

    // Sync activeTab with current route
    useEffect(() => {
        const matchingItem = visibleNavItems.find(item => item.href === pathname);
        if (matchingItem) {
            setActiveTab(matchingItem.id);
        } else if (pathname === '/' || (pathname === '/booking-categories' && bookingCategoriesEnabled)) {
            setActiveTab('packages');
        }
    }, [bookingCategoriesEnabled, pathname, visibleNavItems]);

    return (
        <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
            <div className="max-w-7xl mx-auto px-4">
                <LayoutGroup>
                <nav className="flex items-center justify-center overflow-x-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {visibleNavItems.map((item) => (
                        <motion.button
                            key={item.id}
                            onClick={() => {
                                setActiveTab(item.id);
                                if (item.href) {
                                    router.push(item.href!);
                                }
                            }}
                            className={`relative flex flex-col items-center justify-center px-6 py-4 min-w-25 transition-all duration-200 group ${
                                activeTab === item.id
                                    ? 'text-red-600'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {/* New Badge */}
                            {item.isNew && (
                                <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                    new
                                </span>
                            )}

                            {/* Active Border Box */}
                            {activeTab === item.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-2 border-2 border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 -z-10"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                />
                            )}

                            {/* Icon */}
                            <div className={`mb-1 ${activeTab === item.id ? 'text-red-600 dark:text-red-500' : ''}`}>
                                {item.icon}
                            </div>

                            {/* Label */}
                            <span className={`text-xs font-medium whitespace-nowrap ${
                                activeTab === item.id ? 'text-red-600 dark:text-red-500' : ''
                            }`}>
                                {item.label}
                            </span>

                            {/* Bottom Active Indicator Line */}
                            {activeTab === item.id && (
                                <motion.div
                                    layoutId="activeIndicator"
                                    className="absolute bottom-0 left-0 right-0 h-1 bg-red-600 dark:bg-red-500"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
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

export default Header2;
