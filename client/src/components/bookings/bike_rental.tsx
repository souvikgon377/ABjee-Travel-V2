import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';
import Header2 from '../mvpblocks/Header-2';

interface RentalBike {
    id: number;
    name: string;
    brand: string;
    category: string;
    transmission: string;
    fuelType: string;
    fuelColor: string;
    engine: string;
    mileage: string;
    hasABS: boolean;
    features: string[];
    pricePerDay: number;
    pricePerHour: number;
    securityDeposit: number;
    rating: number;
    reviewCount: number;
    image: string;
    available: boolean;
    kmLimit: string;
    extraKmCharge: number;
    helmet: boolean;
}

const BikeRental: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [rentalType, setRentalType] = useState('daily');
    const [pickupLocation, setPickupLocation] = useState('Mumbai Airport');
    const [dropoffLocation, setDropoffLocation] = useState('Mumbai Airport');
    const [sameDropoff, setSameDropoff] = useState(true);
    const [pickupDate, _setPickupDate] = useState('Fri, 12 Dec 2025');
    const [pickupTime, setPickupTime] = useState('10:00 AM');
    const [dropoffDate, _setDropoffDate] = useState('Sun, 14 Dec 2025');
    const [dropoffTime, setDropoffTime] = useState('10:00 AM');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [bikes, setBikes] = useState<RentalBike[]>([]);

    // Filters
    const [filters, setFilters] = useState({
        bikeType: [] as string[],
        transmission: [] as string[],
        fuelType: [] as string[],
        brand: [] as string[],
        priceRange: [0, 5000] as [number, number],
    });

    const [sortBy, setSortBy] = useState('popularity');

    const rentalTypes = [
        { id: 'hourly', label: 'Hourly', icon: '⏱️' },
        { id: 'daily', label: 'Daily', icon: '📅' },
        { id: 'weekly', label: 'Weekly', icon: '🗓️' },
        { id: 'monthly', label: 'Monthly', icon: '📆' },
    ];

    const bikeTypes = [
        { label: 'Scooter', count: 15 },
        { label: 'Commuter', count: 12 },
        { label: 'Sports', count: 8 },
        { label: 'Cruiser', count: 5 },
        { label: 'Adventure', count: 4 },
        { label: 'Electric', count: 6 },
    ];

    const transmissionTypes = [
        { label: 'Automatic', count: 20 },
        { label: 'Manual', count: 25 },
    ];

    const fuelTypes = [
        { label: 'Petrol', count: 35 },
        { label: 'Electric', count: 10 },
    ];

    const brands = [
        { label: 'Honda', count: 12 },
        { label: 'TVS', count: 10 },
        { label: 'Bajaj', count: 8 },
        { label: 'Royal Enfield', count: 6 },
        { label: 'Yamaha', count: 5 },
        { label: 'Suzuki', count: 4 },
        { label: 'KTM', count: 3 },
        { label: 'Ola', count: 3 },
        { label: 'Ather', count: 2 },
    ];

    const locations = [
        'Mumbai Airport', 'Delhi Airport', 'Bangalore Airport', 'Chennai Airport',
        'Mumbai - Andheri', 'Mumbai - Bandra', 'Delhi - Connaught Place', 
        'Bangalore - MG Road', 'Pune Station', 'Goa - Panjim', 'Goa - Calangute',
        'Jaipur - MI Road', 'Udaipur - City Palace'
    ];

    const timeSlots = [
        '06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
        '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
        '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM', '11:00 PM'
    ];

    const sortOptions = [
        { id: 'popularity', label: 'Popularity' },
        { id: 'priceLow', label: 'Price: Low to High' },
        { id: 'priceHigh', label: 'Price: High to Low' },
        { id: 'rating', label: 'Rating' },
    ];

    useEffect(() => {
        const sampleBikes: RentalBike[] = [
            {
                id: 1,
                name: 'Activa 6G',
                brand: 'Honda',
                category: 'Scooter',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '110cc',
                mileage: '60 km/l',
                hasABS: false,
                features: ['LED Headlamp', 'USB Charging', 'Silent Start', 'External Fuel Lid'],
                pricePerDay: 399,
                pricePerHour: 59,
                securityDeposit: 2000,
                rating: 4.5,
                reviewCount: 524,
                image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '150 km/day',
                extraKmCharge: 3,
                helmet: true,
            },
            {
                id: 2,
                name: 'Jupiter 125',
                brand: 'TVS',
                category: 'Scooter',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '125cc',
                mileage: '55 km/l',
                hasABS: false,
                features: ['Bluetooth Connect', 'Digital Console', 'LED DRL', 'Alloy Wheels'],
                pricePerDay: 449,
                pricePerHour: 69,
                securityDeposit: 2000,
                rating: 4.4,
                reviewCount: 342,
                image: 'https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '150 km/day',
                extraKmCharge: 3,
                helmet: true,
            },
            {
                id: 3,
                name: 'Access 125',
                brand: 'Suzuki',
                category: 'Scooter',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '125cc',
                mileage: '52 km/l',
                hasABS: false,
                features: ['Integrated Braking', 'Chrome Mirrors', 'LED Tail Lamp', 'Front Pocket'],
                pricePerDay: 429,
                pricePerHour: 65,
                securityDeposit: 2000,
                rating: 4.3,
                reviewCount: 289,
                image: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '150 km/day',
                extraKmCharge: 3,
                helmet: true,
            },
            {
                id: 4,
                name: 'Pulsar 150',
                brand: 'Bajaj',
                category: 'Commuter',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '150cc',
                mileage: '50 km/l',
                hasABS: true,
                features: ['Twin Disc Brakes', 'Digital Speedo', 'Tubeless Tyres', 'Electric Start'],
                pricePerDay: 549,
                pricePerHour: 85,
                securityDeposit: 3000,
                rating: 4.6,
                reviewCount: 467,
                image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '200 km/day',
                extraKmCharge: 4,
                helmet: true,
            },
            {
                id: 5,
                name: 'FZ-S V3',
                brand: 'Yamaha',
                category: 'Commuter',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '149cc',
                mileage: '45 km/l',
                hasABS: true,
                features: ['LED Headlight', 'Side Stand Engine Cut-off', 'Negative LCD', 'Bluetooth'],
                pricePerDay: 599,
                pricePerHour: 95,
                securityDeposit: 3000,
                rating: 4.5,
                reviewCount: 378,
                image: 'https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '200 km/day',
                extraKmCharge: 4,
                helmet: true,
            },
            {
                id: 6,
                name: 'Classic 350',
                brand: 'Royal Enfield',
                category: 'Cruiser',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '349cc',
                mileage: '35 km/l',
                hasABS: true,
                features: ['Dual Channel ABS', 'Tripper Navigation', 'USB Charging', 'Alloy Wheels'],
                pricePerDay: 999,
                pricePerHour: 159,
                securityDeposit: 5000,
                rating: 4.8,
                reviewCount: 623,
                image: 'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '250 km/day',
                extraKmCharge: 6,
                helmet: true,
            },
            {
                id: 7,
                name: 'Duke 200',
                brand: 'KTM',
                category: 'Sports',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '199cc',
                mileage: '35 km/l',
                hasABS: true,
                features: ['WP Suspension', 'LED All Around', 'Quickshifter Ready', 'Traction Control'],
                pricePerDay: 1299,
                pricePerHour: 199,
                securityDeposit: 7000,
                rating: 4.7,
                reviewCount: 289,
                image: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '200 km/day',
                extraKmCharge: 8,
                helmet: true,
            },
            {
                id: 8,
                name: 'R15 V4',
                brand: 'Yamaha',
                category: 'Sports',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '155cc',
                mileage: '40 km/l',
                hasABS: true,
                features: ['Traction Control', 'Quick Shifter', 'Deltabox Frame', 'USD Forks'],
                pricePerDay: 1199,
                pricePerHour: 189,
                securityDeposit: 6000,
                rating: 4.6,
                reviewCount: 356,
                image: 'https://images.unsplash.com/photo-1547549082-6bc09f2049ae?w=600&h=400&fit=crop',
                available: false,
                kmLimit: '200 km/day',
                extraKmCharge: 7,
                helmet: true,
            },
            {
                id: 9,
                name: 'Himalayan 450',
                brand: 'Royal Enfield',
                category: 'Adventure',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '452cc',
                mileage: '30 km/l',
                hasABS: true,
                features: ['Tripper Dash', 'Switchable ABS', 'Long Travel Suspension', 'Spoke Wheels'],
                pricePerDay: 1499,
                pricePerHour: 249,
                securityDeposit: 8000,
                rating: 4.8,
                reviewCount: 198,
                image: 'https://images.unsplash.com/photo-1525160354320-d8e92641c563?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 8,
                helmet: true,
            },
            {
                id: 10,
                name: 'Ather 450X',
                brand: 'Ather',
                category: 'Electric',
                transmission: 'Automatic',
                fuelType: 'Electric',
                fuelColor: 'bg-green-500',
                engine: '6.4 kW',
                mileage: '105 km range',
                hasABS: false,
                features: ['Touchscreen Dash', 'Google Maps', 'OTA Updates', 'Fast Charging'],
                pricePerDay: 599,
                pricePerHour: 99,
                securityDeposit: 3000,
                rating: 4.5,
                reviewCount: 234,
                image: 'https://images.unsplash.com/photo-1593764592116-bfb2a97c642a?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '100 km/day',
                extraKmCharge: 2,
                helmet: true,
            },
            {
                id: 11,
                name: 'S1 Pro',
                brand: 'Ola',
                category: 'Electric',
                transmission: 'Automatic',
                fuelType: 'Electric',
                fuelColor: 'bg-green-500',
                engine: '8.5 kW',
                mileage: '170 km range',
                hasABS: false,
                features: ['MoveOS', 'Hyper Mode', 'Hill Hold', 'Reverse Mode'],
                pricePerDay: 649,
                pricePerHour: 109,
                securityDeposit: 3000,
                rating: 4.3,
                reviewCount: 312,
                image: 'https://images.unsplash.com/photo-1611241893603-3c359704e0ee?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '120 km/day',
                extraKmCharge: 2,
                helmet: true,
            },
            {
                id: 12,
                name: 'Apache RTR 160',
                brand: 'TVS',
                category: 'Commuter',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                engine: '160cc',
                mileage: '50 km/l',
                hasABS: true,
                features: ['Race Tuned FI', 'Glide Through Traffic', 'SmartXonnect', 'LED Tail Lamp'],
                pricePerDay: 649,
                pricePerHour: 99,
                securityDeposit: 3500,
                rating: 4.5,
                reviewCount: 423,
                image: 'https://images.unsplash.com/photo-1622185135505-2d795003994a?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '200 km/day',
                extraKmCharge: 5,
                helmet: true,
            },
        ];

        setTimeout(() => {
            setBikes(sampleBikes);
            setLoading(false);
        }, 1000);
    }, []);

    const toggleFilter = (filterType: 'bikeType' | 'transmission' | 'fuelType' | 'brand', value: string) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: prev[filterType].includes(value)
                ? prev[filterType].filter(v => v !== value)
                : [...prev[filterType], value]
        }));
    };

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

    const getPrice = (bike: RentalBike) => {
        switch (rentalType) {
            case 'hourly': return bike.pricePerHour;
            case 'weekly': return bike.pricePerDay * 7 * 0.85;
            case 'monthly': return bike.pricePerDay * 30 * 0.7;
            default: return bike.pricePerDay;
        }
    };

    const getPriceLabel = () => {
        switch (rentalType) {
            case 'hourly': return '/hour';
            case 'weekly': return '/week';
            case 'monthly': return '/month';
            default: return '/day';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header1 />
             {/* Spacer for fixed header - matches dark header background */}
            <div className="h-10 bg-white dark:bg-black"></div>
            <Header2 />
            {/* Hero Section with Search */}
            <div className="mx-4 mt-4">
                <div className="bg-linear-to-b from-orange-500 via-orange-600 to-orange-700 text-white rounded-3xl pb-16">
                    <div className="max-w-7xl mx-auto px-4 pt-10 pb-8">
                        <div className="text-center mb-8">
                            <h1 className="text-4xl font-bold mb-3 italic">Self-Drive Bike Rentals</h1>
                            <p className="text-orange-100 text-lg">Ride your way. Freedom on two wheels. Explore more.</p>
                        </div>

                        {/* Rental Type Tabs */}
                        <div className="flex justify-center gap-3 mb-8">
                            {rentalTypes.map(type => (
                                <motion.button
                                    key={type.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setRentalType(type.id)}
                                    className={`px-6 py-2.5 rounded-full font-medium transition-all flex items-center gap-2 ${
                                        rentalType === type.id
                                            ? 'bg-white text-orange-600 shadow-lg'
                                            : 'bg-white/20 hover:bg-white/30 border border-white/30'
                                    }`}
                                >
                                    <span>{type.icon}</span>
                                    {type.label}
                                </motion.button>
                            ))}
                        </div>

                        {/* Search Form */}
                        <div className="search-dropdown-container bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-2xl mx-4">
                            <div className="flex flex-wrap items-end gap-4">
                                {/* Pickup Location */}
                                <div className="flex-1 min-w-50 relative">
                                    <div 
                                        className="cursor-pointer"
                                        onClick={() => setActiveDropdown(activeDropdown === 'pickup' ? null : 'pickup')}
                                    >
                                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pickup Location</div>
                                        <div className="flex items-center gap-2 border-b-2 border-orange-500 pb-2">
                                            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="font-bold text-gray-800 dark:text-white">{pickupLocation}</span>
                                            <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <AnimatePresence>
                                        {activeDropdown === 'pickup' && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                data-lenis-prevent
                                                className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-h-64 overflow-y-auto border dark:border-gray-700"
                                            >
                                                {locations.map(loc => (
                                                    <div
                                                        key={loc}
                                                        onClick={() => { setPickupLocation(loc); if (sameDropoff) setDropoffLocation(loc); setActiveDropdown(null); }}
                                                        className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 ${pickupLocation === loc ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : ''}`}
                                                    >
                                                        {loc}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Same Dropoff Checkbox */}
                                <div className="flex items-center gap-2 pb-2">
                                    <input 
                                        type="checkbox" 
                                        id="sameDropoff"
                                        checked={sameDropoff}
                                        onChange={(e) => { setSameDropoff(e.target.checked); if (e.target.checked) setDropoffLocation(pickupLocation); }}
                                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                                    />
                                    <label htmlFor="sameDropoff" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">Same drop-off</label>
                                </div>

                                {/* Dropoff Location */}
                                {!sameDropoff && (
                                    <div className="flex-1 min-w-50 relative">
                                        <div 
                                            className="cursor-pointer"
                                            onClick={() => setActiveDropdown(activeDropdown === 'dropoff' ? null : 'dropoff')}
                                        >
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Drop-off Location</div>
                                            <div className="flex items-center gap-2 border-b-2 border-orange-500 pb-2">
                                                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                </svg>
                                                <span className="font-bold text-gray-800 dark:text-white">{dropoffLocation}</span>
                                                <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                        <AnimatePresence>
                                            {activeDropdown === 'dropoff' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                data-lenis-prevent
                                                className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-h-64 overflow-y-auto border dark:border-gray-700"
                                            >
                                                    {locations.map(loc => (
                                                        <div
                                                            key={loc}
                                                            onClick={() => { setDropoffLocation(loc); setActiveDropdown(null); }}
                                                            className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 ${dropoffLocation === loc ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : ''}`}
                                                        >
                                                            {loc}
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Pickup Date & Time */}
                                <div className="min-w-35">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pickup</div>
                                    <div className="border-b-2 border-orange-500 pb-2">
                                        <div className="font-bold text-gray-800 dark:text-white">{pickupDate}</div>
                                        <div className="relative">
                                            <select 
                                                value={pickupTime}
                                                onChange={(e) => setPickupTime(e.target.value)}
                                                className="text-sm text-gray-600 dark:text-gray-300 bg-transparent focus:outline-none cursor-pointer"
                                            >
                                                {timeSlots.map(time => (
                                                    <option key={time} value={time}>{time}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Dropoff Date & Time */}
                                <div className="min-w-35">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Drop-off</div>
                                    <div className="border-b-2 border-orange-500 pb-2">
                                        <div className="font-bold text-gray-800 dark:text-white">{dropoffDate}</div>
                                        <div className="relative">
                                            <select 
                                                value={dropoffTime}
                                                onChange={(e) => setDropoffTime(e.target.value)}
                                                className="text-sm text-gray-600 dark:text-gray-300 bg-transparent focus:outline-none cursor-pointer"
                                            >
                                                {timeSlots.map(time => (
                                                    <option key={time} value={time}>{time}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Search Button */}
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="bg-orange-500 text-white px-10 py-3 rounded-full font-bold text-lg hover:bg-orange-600 transition-all shadow-lg"
                                >
                                    SEARCH BIKES
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Benefits Banner */}
            <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-around text-sm">
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span><strong>Free Helmet</strong> included</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span><strong>Sanitized Bikes</strong> for safety</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span><strong>24x7 Support</strong> available</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <span><strong>Zero Deposit</strong> on select bikes</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-6">
                    {/* Left Sidebar - Filters */}
                    <motion.aside 
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-64 shrink-0"
                    >
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sticky top-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 dark:text-white text-lg">Filters</h3>
                                <button 
                                    onClick={() => setFilters({ bikeType: [], transmission: [], fuelType: [], brand: [], priceRange: [0, 5000] })}
                                    className="text-orange-500 text-sm font-medium hover:underline"
                                >
                                    CLEAR ALL
                                </button>
                            </div>

                            {/* Bike Type */}
                            <div className="border-t dark:border-gray-700 pt-4 mb-4">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Bike Type</h4>
                                <div className="space-y-2">
                                    {bikeTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.bikeType.includes(type.label)}
                                                    onChange={() => toggleFilter('bikeType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-orange-500">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Transmission */}
                            <div className="border-t dark:border-gray-700 pt-4 mb-4">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Transmission</h4>
                                <div className="space-y-2">
                                    {transmissionTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.transmission.includes(type.label)}
                                                    onChange={() => toggleFilter('transmission', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-orange-500">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Fuel Type */}
                            <div className="border-t dark:border-gray-700 pt-4 mb-4">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Fuel Type</h4>
                                <div className="space-y-2">
                                    {fuelTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.fuelType.includes(type.label)}
                                                    onChange={() => toggleFilter('fuelType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-orange-500">{type.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({type.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Brands */}
                            <div className="border-t dark:border-gray-700 pt-4">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Brands</h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {brands.map(brand => (
                                        <label key={brand.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.brand.includes(brand.label)}
                                                    onChange={() => toggleFilter('brand', brand.label)}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-500 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-orange-500">{brand.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({brand.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.aside>

                    {/* Main Content - Bike List */}
                    <main className="flex-1">
                        {/* Results Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{bikes.length} Bikes Available</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Sort by:</span>
                                <select 
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="border dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                                >
                                    {sortOptions.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Bike Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bikes.map((bike, idx) => (
                                <motion.div
                                    key={bike.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
                                    className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border-2 dark:border-gray-700 transition-all ${!bike.available ? 'opacity-60' : 'hover:border-orange-300 dark:hover:border-orange-500'}`}
                                >
                                    {/* Bike Image */}
                                    <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
                                        <img 
                                            src={bike.image} 
                                            alt={bike.name} 
                                            className="w-full h-full object-cover"
                                        />
                                        {!bike.available && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold">SOLD OUT</span>
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3 flex gap-2">
                                            <span className={`${bike.fuelColor} text-white text-xs px-2 py-1 rounded font-medium`}>
                                                {bike.fuelType}
                                            </span>
                                            <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded font-medium">
                                                {bike.transmission}
                                            </span>
                                        </div>
                                        <div className="absolute top-3 right-3 bg-white rounded-full px-2 py-1 flex items-center gap-1 shadow">
                                            <svg className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span className="text-sm font-bold">{bike.rating}</span>
                                        </div>
                                        {bike.helmet && (
                                            <div className="absolute bottom-3 left-3 bg-green-500 text-white text-xs px-2 py-1 rounded font-medium flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                                Free Helmet
                                            </div>
                                        )}
                                    </div>

                                    {/* Bike Details */}
                                    <div className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{bike.brand} {bike.name}</h3>
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">{bike.category} • {bike.engine}</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xl font-bold text-gray-800 dark:text-white">₹{Math.round(getPrice(bike)).toLocaleString()}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{getPriceLabel()}</div>
                                            </div>
                                        </div>

                                        {/* Features */}
                                        <div className="flex items-center gap-3 mt-3 text-gray-600 dark:text-gray-400 text-xs">
                                            <span className="flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                {bike.mileage}
                                            </span>
                                            {bike.hasABS && (
                                                <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-xs font-medium">
                                                    ABS
                                                </span>
                                            )}
                                        </div>

                                        {/* KM Limit & Deposit */}
                                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span>{bike.kmLimit}</span>
                                            <span>•</span>
                                            <span>₹{bike.extraKmCharge}/km extra</span>
                                        </div>

                                        {/* Features Tags */}
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {bike.features.slice(0, 2).map((feature, i) => (
                                                <span key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded">
                                                    {feature}
                                                </span>
                                            ))}
                                            {bike.features.length > 2 && (
                                                <span className="text-orange-500 text-xs px-2 py-1">
                                                    +{bike.features.length - 2} more
                                                </span>
                                            )}
                                        </div>

                                        {/* Book Button */}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            disabled={!bike.available}
                                            className={`w-full mt-4 py-2.5 rounded-lg font-bold transition-all ${
                                                bike.available
                                                    ? 'bg-linear-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-md'
                                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            }`}
                                        >
                                            {bike.available ? 'BOOK NOW' : 'NOT AVAILABLE'}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default BikeRental;
