import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';
import Header2 from '../mvpblocks/Header-2';

interface Cab {
    id: number;
    name: string;
    similar: string;
    rating: number;
    ratingLabel: string;
    fuelType: string;
    fuelColor: string;
    seats: number;
    hasAC: boolean;
    originalPrice: number;
    price: number;
    taxes: number;
    discount: number;
    image: string;
    inclusions: string[];
    exclusions: string[];
}

const CarBooking: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [tripType, setTripType] = useState('outstation-oneway');
    const [fromCity, setFromCity] = useState('Mumbai');
    const [toCity, setToCity] = useState('Pune');
    const [pickupDate, _setPickupDate] = useState('Fri, 12 Dec 2025');
    const [pickupTime, setPickupTime] = useState('10:00 AM');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [cabs, setCabs] = useState<Cab[]>([]);
    const [expandedCard, setExpandedCard] = useState<{ [key: number]: { inclusions: boolean; cancellation: boolean } }>({});

    // Filters
    const [filters, setFilters] = useState({
        cabType: [] as string[],
        fuelType: [] as string[],
        modelType: [] as string[],
    });

    const tripTypes = [
        { id: 'outstation-oneway', label: 'Outstation One-Way' },
        { id: 'outstation-roundtrip', label: 'Outstation Round Trip' },
        { id: 'local', label: 'Local' },
        { id: 'airport', label: 'Airport Transfer' },
    ];

    const cabTypes = [
        { label: 'HATCHBACK', count: 3 },
        { label: 'SEDAN', count: 3 },
        { label: 'SUV', count: 8 },
        { label: 'LUXURY', count: 2 },
    ];

    const fuelTypes = [
        { label: 'PETROL', count: 6 },
        { label: 'ELECTRIC', count: 4 },
        { label: 'DIESEL', count: 1 },
        { label: 'CNG', count: 3 },
    ];

    const modelTypes = [
        { label: 'BYD E6', count: 1 },
        { label: 'MG ZS', count: 2 },
        { label: 'Swift Dzire', count: 4 },
        { label: 'Toyota Innova', count: 3 },
        { label: 'Ertiga', count: 2 },
    ];

    const cities = [
        'Mumbai', 'Pune', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 
        'Ahmedabad', 'Jaipur', 'Goa', 'Lonavala', 'Mahabaleshwar', 'Shirdi'
    ];

    const timeSlots = [
        '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
        '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
        '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM'
    ];

    useEffect(() => {
        // Sample cab data
        const sampleCabs: Cab[] = [
            {
                id: 1,
                name: 'Indica, Swift',
                similar: 'or similar',
                rating: 4,
                ratingLabel: 'Good',
                fuelType: 'CNG/Diesel',
                fuelColor: 'bg-teal-500',
                seats: 4,
                hasAC: true,
                originalPrice: 2609,
                price: 2201,
                taxes: 615,
                discount: 16,
                image: 'https://imgd.aeplcdn.com/600x337/n/cw/ec/130591/fronx-exterior-right-front-three-quarter-109.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Fuel charges', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
            {
                id: 2,
                name: 'Indica, Swift',
                similar: 'or similar',
                rating: 0,
                ratingLabel: 'NEW',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 4,
                hasAC: true,
                originalPrice: 2800,
                price: 2366,
                taxes: 623,
                discount: 16,
                image: 'https://imgd.aeplcdn.com/600x337/n/cw/ec/130591/fronx-exterior-right-front-three-quarter-109.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Fuel charges', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
            {
                id: 3,
                name: 'Swift Dzire, Xcent',
                similar: 'or similar',
                rating: 4.2,
                ratingLabel: 'Very Good',
                fuelType: 'Diesel',
                fuelColor: 'bg-gray-600',
                seats: 4,
                hasAC: true,
                originalPrice: 3200,
                price: 2720,
                taxes: 680,
                discount: 15,
                image: 'https://imgd.aeplcdn.com/664x374/n/cw/ec/54399/dzire-exterior-right-front-three-quarter-5.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Fuel charges', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
            {
                id: 4,
                name: 'BYD E6',
                similar: 'Electric SUV',
                rating: 4.5,
                ratingLabel: 'Excellent',
                fuelType: 'Electric',
                fuelColor: 'bg-green-500',
                seats: 5,
                hasAC: true,
                originalPrice: 4500,
                price: 3825,
                taxes: 850,
                discount: 15,
                image: 'https://imgd.aeplcdn.com/664x374/n/cw/ec/144681/byd-e6-right-front-three-quarter1.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Charging included', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
            {
                id: 5,
                name: 'Ertiga, Marazzo',
                similar: 'or similar',
                rating: 4.3,
                ratingLabel: 'Very Good',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 6,
                hasAC: true,
                originalPrice: 3800,
                price: 3230,
                taxes: 750,
                discount: 15,
                image: 'https://imgd.aeplcdn.com/664x374/n/cw/ec/115777/ertiga-exterior-right-front-three-quarter-2.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Fuel charges', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
            {
                id: 6,
                name: 'Toyota Innova',
                similar: 'Crysta',
                rating: 4.6,
                ratingLabel: 'Excellent',
                fuelType: 'Diesel',
                fuelColor: 'bg-gray-600',
                seats: 7,
                hasAC: true,
                originalPrice: 5500,
                price: 4675,
                taxes: 950,
                discount: 15,
                image: 'https://imgd.aeplcdn.com/664x374/n/cw/ec/140809/innova-crysta-exterior-right-front-three-quarter-2.jpeg?isig=0&q=80',
                inclusions: ['Driver allowance', 'Fuel charges', 'State tax & toll'],
                exclusions: ['Night charges (if applicable)', 'Parking charges'],
            },
        ];

        setTimeout(() => {
            setCabs(sampleCabs);
            setLoading(false);
        }, 1000);
    }, []);

    const toggleFilter = (filterType: 'cabType' | 'fuelType' | 'modelType', value: string) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: prev[filterType].includes(value)
                ? prev[filterType].filter(v => v !== value)
                : [...prev[filterType], value]
        }));
    };

    const toggleCardSection = (cabId: number, section: 'inclusions' | 'cancellation') => {
        setExpandedCard(prev => ({
            ...prev,
            [cabId]: {
                ...prev[cabId],
                [section]: !prev[cabId]?.[section]
            }
        }));
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.search-dropdown-container')) {
                setActiveDropdown(null);
            }
        };
        if (activeDropdown) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [activeDropdown]);

    if (loading) {
        return (
            <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-red-800 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white dark:bg-gray-900">
            {/* Header */}
            <Header1 />
            
            {/* Spacer for fixed header - matches dark header background */}
            <div className="h-10 bg-white dark:bg-black"></div>

            <Header2 />
         
            
            {/* Spacer for fixed header - matches dark header background */}
            <div className="h-10 bg-white dark:bg-black"></div>
            
            {/* Search Header */}
            <div className="bg-gradient-to-r from-[#0f172a] via-[#1e3a5f] to-[#0f172a] text-white">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="search-dropdown-container flex flex-wrap items-end gap-3">
                        {/* Trip Type */}
                        <div className="relative">
                            <div 
                                className="cursor-pointer"
                                onClick={() => setActiveDropdown(activeDropdown === 'tripType' ? null : 'tripType')}
                            >
                                <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">Trip Type</div>
                                <div className="flex items-center gap-2 bg-transparent border-b border-gray-500 pb-1 min-w-[180px]">
                                    <span className="font-medium">{tripTypes.find(t => t.id === tripType)?.label}</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <AnimatePresence>
                                {activeDropdown === 'tripType' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        data-lenis-prevent
                                        className="absolute top-full left-0 mt-2 max-h-60 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 min-w-[200px] overflow-y-auto"
                                    >
                                        {tripTypes.map(type => (
                                            <div
                                                key={type.id}
                                                onClick={() => { setTripType(type.id); setActiveDropdown(null); }}
                                                className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white ${tripType === type.id ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300' : ''}`}
                                            >
                                                {type.label}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* From City */}
                        <div className="relative">
                            <div 
                                className="cursor-pointer"
                                onClick={() => setActiveDropdown(activeDropdown === 'from' ? null : 'from')}
                            >
                                <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">From</div>
                                <div className="font-bold text-xl border-b border-gray-500 pb-1 min-w-[120px]">{fromCity}</div>
                            </div>
                            <AnimatePresence>
                                {activeDropdown === 'from' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        data-lenis-prevent
                                        className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 min-w-[200px] max-h-64 overflow-y-auto"
                                    >
                                        {cities.map(city => (
                                            <div
                                                key={city}
                                                onClick={() => { setFromCity(city); setActiveDropdown(null); }}
                                                className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white ${fromCity === city ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300' : ''}`}
                                            >
                                                {city}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* To City */}
                        <div className="relative">
                            <div 
                                className="cursor-pointer"
                                onClick={() => setActiveDropdown(activeDropdown === 'to' ? null : 'to')}
                            >
                                <div className="text-xs text-yellow-400 uppercase tracking-wide mb-1">To</div>
                                <div className="font-bold text-xl border-b border-gray-500 pb-1 min-w-[120px]">{toCity}</div>
                            </div>
                            <AnimatePresence>
                                {activeDropdown === 'to' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        data-lenis-prevent
                                        className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 min-w-[200px] max-h-64 overflow-y-auto"
                                    >
                                        {cities.map(city => (
                                            <div
                                                key={city}
                                                onClick={() => { setToCity(city); setActiveDropdown(null); }}
                                                className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white ${toCity === city ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300' : ''}`}
                                            >
                                                {city}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Add Stops */}
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative px-4 py-2 border border-dashed border-gray-400 rounded-lg text-sm font-medium hover:border-white transition-colors"
                        >
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                                new
                            </span>
                            + ADD STOPS
                        </motion.button>

                        {/* Pick-up Date */}
                        <div className="relative">
                            <div 
                                className="cursor-pointer"
                                onClick={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
                            >
                                <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">Pick-up Date</div>
                                <div className="font-bold border-b border-gray-500 pb-1 min-w-[140px]">{pickupDate}</div>
                            </div>
                        </div>

                        {/* Pick-up Time */}
                        <div className="relative">
                            <div 
                                className="cursor-pointer"
                                onClick={() => setActiveDropdown(activeDropdown === 'time' ? null : 'time')}
                            >
                                <div className="text-xs text-blue-400 uppercase tracking-wide mb-1">Pick-up Time</div>
                                <div className="font-bold border-b border-gray-500 pb-1 min-w-[100px]">{pickupTime}</div>
                            </div>
                            <AnimatePresence>
                                {activeDropdown === 'time' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        data-lenis-prevent
                                        className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 min-w-[120px] max-h-64 overflow-y-auto"
                                    >
                                        {timeSlots.map(time => (
                                            <div
                                                key={time}
                                                onClick={() => { setPickupTime(time); setActiveDropdown(null); }}
                                                className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white text-sm ${pickupTime === time ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300' : ''}`}
                                            >
                                                {time}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Search Button */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-10 py-3 rounded-lg font-bold text-lg hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg ml-auto"
                        >
                            SEARCH
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-6 bg-white dark:bg-gray-900">
                {/* Route Info */}
                <div className="text-gray-600 dark:text-gray-400 mb-4">
                    Rates for <span className="font-bold text-gray-800 dark:text-white">148 Kms</span> approx distance | <span className="font-bold text-gray-800 dark:text-white">3 hr(s)</span> approx time
                </div>

                {/* Trust Banner */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-[#1a3a5c] to-[#2a5a8c] rounded-xl p-4 mb-4 text-white"
                >
                    <div className="flex items-center justify-around">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <span className="font-semibold">Trusted Drivers</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="font-semibold">Clean Cabs</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="font-semibold">On-Time Pickup</span>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/20 text-center text-sm">
                        Our Top Rated Partner <span className="bg-yellow-400 text-gray-900 px-2 py-0.5 rounded font-bold mx-1">SAVAARI</span> a make my trip Group Company
                    </div>
                </motion.div>

                <div className="flex gap-6">
                    {/* Left Sidebar - Filters */}
                    <motion.aside 
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-64 flex-shrink-0"
                    >
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 dark:text-white text-lg">Filters</h3>
                                <button className="text-blue-600 text-sm font-medium hover:underline">CLEAR ALL</button>
                            </div>

                            {/* Cab Type */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-gray-800 dark:text-white">Cab Type</h4>
                                    <button className="text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-300">CLEAR</button>
                                </div>
                                <div className="space-y-2">
                                    {cabTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.cabType.includes(type.label)}
                                                    onChange={() => toggleFilter('cabType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Fuel Type */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-gray-800 dark:text-white">Fuel Type</h4>
                                    <button className="text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-300">CLEAR</button>
                                </div>
                                <div className="space-y-2">
                                    {fuelTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.fuelType.includes(type.label)}
                                                    onChange={() => toggleFilter('fuelType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Model Type */}
                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-gray-800 dark:text-white">Model Type</h4>
                                    <button className="text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-300">CLEAR</button>
                                </div>
                                <div className="space-y-2">
                                    {modelTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.modelType.includes(type.label)}
                                                    onChange={() => toggleFilter('modelType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.aside>

                    {/* Main Content - Cab List */}
                    <main className="flex-1">
                        <div className="space-y-4">
                            {cabs.map((cab, idx) => (
                                <motion.div
                                    key={cab.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
                                >
                                    <div className="p-4">
                                        <div className="flex items-start gap-4">
                                            {/* Car Image */}
                                            <div className="relative w-40 h-28 flex-shrink-0">
                                                <img 
                                                    src={cab.image} 
                                                    alt={cab.name} 
                                                    className="w-full h-full object-cover rounded-lg"
                                                />
                                                <span className={`absolute bottom-2 left-2 ${cab.fuelColor} text-white text-xs px-2 py-1 rounded font-medium`}>
                                                    {cab.fuelType}
                                                </span>
                                            </div>

                                            {/* Cab Details */}
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">{cab.name}</h3>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-gray-500 dark:text-gray-400 text-sm">{cab.similar}</span>
                                                            {cab.rating > 0 ? (
                                                                <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                                                    ★ {cab.rating}
                                                                </span>
                                                            ) : (
                                                                <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">
                                                                    {cab.ratingLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Price */}
                                                    <div className="text-right">
                                                        <div className="text-green-600 text-sm font-medium">
                                                            {cab.discount}% off <span className="text-gray-400 line-through">₹{cab.originalPrice.toLocaleString()}</span>
                                                        </div>
                                                        <div className="text-2xl font-bold text-gray-800 dark:text-white">₹{cab.price.toLocaleString()}</div>
                                                        <div className="text-gray-500 dark:text-gray-400 text-xs">+ ₹{cab.taxes} (Taxes & Charges)</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4 mt-3 text-gray-600 dark:text-gray-400 text-sm">
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                        </svg>
                                                        {cab.seats} Seats
                                                    </span>
                                                    <span>•</span>
                                                    <span>{cab.hasAC ? 'AC' : 'Non-AC'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expandable Sections & Select Button */}
                                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                                        <div className="flex items-center gap-6">
                                            <button 
                                                onClick={() => toggleCardSection(cab.id, 'inclusions')}
                                                className="flex items-center gap-1 text-gray-600 dark:text-gray-300 text-sm hover:text-blue-600">
                                                Inclusions and Exclusions
                                                <svg className={`w-4 h-4 transition-transform ${expandedCard[cab.id]?.inclusions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => toggleCardSection(cab.id, 'cancellation')}
                                                className="flex items-center gap-1 text-gray-600 dark:text-gray-300 text-sm hover:text-blue-600">
                                                Cancellation Policy
                                                <svg className={`w-4 h-4 transition-transform ${expandedCard[cab.id]?.cancellation ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md"
                                        >
                                            SELECT CAB
                                        </motion.button>
                                    </div>

                                    {/* Expanded Content */}
                                    <AnimatePresence>
                                        {expandedCard[cab.id]?.inclusions && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-700"
                                            >
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <h4 className="font-semibold text-green-600 mb-2">Inclusions</h4>
                                                        <ul className="space-y-1">
                                                            {cab.inclusions.map((item, i) => (
                                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                                                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                    {item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-red-600 mb-2">Exclusions</h4>
                                                        <ul className="space-y-1">
                                                            {cab.exclusions.map((item, i) => (
                                                                <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                                                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                    </svg>
                                                                    {item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <AnimatePresence>
                                        {expandedCard[cab.id]?.cancellation && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-700"
                                            >
                                                <h4 className="font-semibold text-gray-800 dark:text-white mb-2">Cancellation Policy</h4>
                                                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                                    <p className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                        Free cancellation till 24 hours before pickup
                                                    </p>
                                                    <p className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                                        50% refund if cancelled 6-24 hours before pickup
                                                    </p>
                                                    <p className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                        No refund if cancelled less than 6 hours before pickup
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default CarBooking;
