import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';
import Header2 from '../mvpblocks/Header-2';

interface RentalCar {
    id: number;
    name: string;
    brand: string;
    category: string;
    transmission: string;
    fuelType: string;
    fuelColor: string;
    seats: number;
    luggage: number;
    mileage: string;
    hasAC: boolean;
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
}

const CarRental: React.FC = () => {
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
    const [cars, setCars] = useState<RentalCar[]>([]);
    const [_selectedCar, _setSelectedCar] = useState<RentalCar | null>(null);

    // Filters
    const [filters, setFilters] = useState({
        carType: [] as string[],
        transmission: [] as string[],
        fuelType: [] as string[],
        brand: [] as string[],
        priceRange: [0, 10000] as [number, number],
    });

    const [sortBy, setSortBy] = useState('popularity');

    const rentalTypes = [
        { id: 'hourly', label: 'Hourly', icon: '⏱️' },
        { id: 'daily', label: 'Daily', icon: '📅' },
        { id: 'weekly', label: 'Weekly', icon: '🗓️' },
        { id: 'monthly', label: 'Monthly', icon: '📆' },
    ];

    const carTypes = [
        { label: 'Hatchback', count: 8 },
        { label: 'Sedan', count: 12 },
        { label: 'SUV', count: 15 },
        { label: 'MUV', count: 6 },
        { label: 'Luxury', count: 4 },
        { label: 'Premium', count: 3 },
    ];

    const transmissionTypes = [
        { label: 'Manual', count: 25 },
        { label: 'Automatic', count: 18 },
    ];

    const fuelTypes = [
        { label: 'Petrol', count: 20 },
        { label: 'Diesel', count: 15 },
        { label: 'Electric', count: 5 },
        { label: 'Hybrid', count: 3 },
    ];

    const brands = [
        { label: 'Maruti Suzuki', count: 12 },
        { label: 'Hyundai', count: 10 },
        { label: 'Tata', count: 8 },
        { label: 'Mahindra', count: 6 },
        { label: 'Toyota', count: 4 },
        { label: 'Honda', count: 3 },
        { label: 'BMW', count: 2 },
        { label: 'Mercedes', count: 2 },
    ];

    const locations = [
        'Mumbai Airport', 'Delhi Airport', 'Bangalore Airport', 'Chennai Airport',
        'Mumbai - Andheri', 'Mumbai - Bandra', 'Delhi - Connaught Place', 
        'Bangalore - MG Road', 'Pune Station', 'Goa - Panjim'
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
        const sampleCars: RentalCar[] = [
            {
                id: 1,
                name: 'Swift',
                brand: 'Maruti Suzuki',
                category: 'Hatchback',
                transmission: 'Manual',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 5,
                luggage: 2,
                mileage: '22 km/l',
                hasAC: true,
                features: ['Bluetooth', 'USB Charging', 'Power Steering', 'Central Locking'],
                pricePerDay: 1499,
                pricePerHour: 199,
                securityDeposit: 5000,
                rating: 4.5,
                reviewCount: 324,
                image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 12,
            },
            {
                id: 2,
                name: 'i20',
                brand: 'Hyundai',
                category: 'Hatchback',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 5,
                luggage: 2,
                mileage: '20 km/l',
                hasAC: true,
                features: ['Sunroof', 'Touchscreen', 'Rear Camera', 'Wireless Charging'],
                pricePerDay: 1999,
                pricePerHour: 299,
                securityDeposit: 7000,
                rating: 4.6,
                reviewCount: 256,
                image: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 14,
            },
            {
                id: 3,
                name: 'City',
                brand: 'Honda',
                category: 'Sedan',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 5,
                luggage: 3,
                mileage: '18 km/l',
                hasAC: true,
                features: ['Leather Seats', 'Cruise Control', 'Lane Assist', '6 Airbags'],
                pricePerDay: 2999,
                pricePerHour: 449,
                securityDeposit: 10000,
                rating: 4.7,
                reviewCount: 189,
                image: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 16,
            },
            {
                id: 4,
                name: 'Creta',
                brand: 'Hyundai',
                category: 'SUV',
                transmission: 'Automatic',
                fuelType: 'Diesel',
                fuelColor: 'bg-gray-600',
                seats: 5,
                luggage: 4,
                mileage: '21 km/l',
                hasAC: true,
                features: ['Panoramic Sunroof', '360° Camera', 'Ventilated Seats', 'ADAS'],
                pricePerDay: 3499,
                pricePerHour: 549,
                securityDeposit: 12000,
                rating: 4.8,
                reviewCount: 412,
                image: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 18,
            },
            {
                id: 5,
                name: 'Nexon EV',
                brand: 'Tata',
                category: 'SUV',
                transmission: 'Automatic',
                fuelType: 'Electric',
                fuelColor: 'bg-green-500',
                seats: 5,
                luggage: 3,
                mileage: '312 km range',
                hasAC: true,
                features: ['Zero Emission', 'Fast Charging', 'Connected Car', 'Regenerative Braking'],
                pricePerDay: 2999,
                pricePerHour: 449,
                securityDeposit: 15000,
                rating: 4.6,
                reviewCount: 178,
                image: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '250 km/day',
                extraKmCharge: 8,
            },
            {
                id: 6,
                name: 'Innova Crysta',
                brand: 'Toyota',
                category: 'MUV',
                transmission: 'Automatic',
                fuelType: 'Diesel',
                fuelColor: 'bg-gray-600',
                seats: 7,
                luggage: 5,
                mileage: '15 km/l',
                hasAC: true,
                features: ['Captain Seats', 'Dual Zone AC', 'Roof AC', 'Premium Audio'],
                pricePerDay: 4999,
                pricePerHour: 749,
                securityDeposit: 20000,
                rating: 4.9,
                reviewCount: 523,
                image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 20,
            },
            {
                id: 7,
                name: '3 Series',
                brand: 'BMW',
                category: 'Luxury',
                transmission: 'Automatic',
                fuelType: 'Petrol',
                fuelColor: 'bg-orange-500',
                seats: 5,
                luggage: 3,
                mileage: '14 km/l',
                hasAC: true,
                features: ['Premium Interior', 'Heads-up Display', 'Harman Kardon', 'M Sport'],
                pricePerDay: 8999,
                pricePerHour: 1499,
                securityDeposit: 50000,
                rating: 4.9,
                reviewCount: 89,
                image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&h=400&fit=crop',
                available: false,
                kmLimit: '200 km/day',
                extraKmCharge: 35,
            },
            {
                id: 8,
                name: 'XUV700',
                brand: 'Mahindra',
                category: 'SUV',
                transmission: 'Automatic',
                fuelType: 'Diesel',
                fuelColor: 'bg-gray-600',
                seats: 7,
                luggage: 4,
                mileage: '16 km/l',
                hasAC: true,
                features: ['ADAS Level 2', 'Dual Screens', 'Alexa Built-in', 'Flush Handles'],
                pricePerDay: 4499,
                pricePerHour: 699,
                securityDeposit: 18000,
                rating: 4.7,
                reviewCount: 267,
                image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=600&h=400&fit=crop',
                available: true,
                kmLimit: '300 km/day',
                extraKmCharge: 22,
            },
        ];

        setTimeout(() => {
            setCars(sampleCars);
            setLoading(false);
        }, 1000);
    }, []);

    const toggleFilter = (filterType: 'carType' | 'transmission' | 'fuelType' | 'brand', value: string) => {
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

    const getPrice = (car: RentalCar) => {
        switch (rentalType) {
            case 'hourly': return car.pricePerHour;
            case 'weekly': return car.pricePerDay * 7 * 0.85;
            case 'monthly': return car.pricePerDay * 30 * 0.7;
            default: return car.pricePerDay;
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
                    className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <Header1/>
             {/* Spacer for fixed header - matches dark header background */}
            <div className="h-10 bg-white dark:bg-black"></div>
            <Header2/>
            {/* Hero Section with Search */}
            <div className="mx-4 mt-4">
                <div className="bg-gradient-to-b from-blue-500 via-blue-600 to-blue-700 text-white rounded-3xl pb-16">
                    <div className="max-w-7xl mx-auto px-4 pt-10 pb-8">
                        <div className="text-center mb-8">
                            <h1 className="text-4xl font-bold mb-3 italic">Self-Drive Car Rentals</h1>
                            <p className="text-blue-100 text-lg">Drive your way. No driver needed. Freedom to explore.</p>
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
                                            ? 'bg-white text-blue-600 shadow-lg'
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
                            <div className="flex-1 min-w-[200px] relative">
                                <div 
                                    className="cursor-pointer"
                                    onClick={() => setActiveDropdown(activeDropdown === 'pickup' ? null : 'pickup')}
                                >
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pickup Location</div>
                                    <div className="flex items-center gap-2 border-b-2 border-blue-600 pb-2">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                            className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-h-64 overflow-y-auto border dark:border-gray-700"
                                        >
                                            {locations.map(loc => (
                                                <div
                                                    key={loc}
                                                    onClick={() => { setPickupLocation(loc); if (sameDropoff) setDropoffLocation(loc); setActiveDropdown(null); }}
                                                    className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 ${pickupLocation === loc ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : ''}`}
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
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-600"
                                />
                                <label htmlFor="sameDropoff" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">Same drop-off</label>
                            </div>

                            {/* Dropoff Location */}
                            {!sameDropoff && (
                                <div className="flex-1 min-w-[200px] relative">
                                    <div 
                                        className="cursor-pointer"
                                        onClick={() => setActiveDropdown(activeDropdown === 'dropoff' ? null : 'dropoff')}
                                    >
                                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Drop-off Location</div>
                                        <div className="flex items-center gap-2 border-b-2 border-blue-600 pb-2">
                                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                                className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-50 w-full max-h-64 overflow-y-auto border dark:border-gray-700"
                                            >
                                                {locations.map(loc => (
                                                    <div
                                                        key={loc}
                                                        onClick={() => { setDropoffLocation(loc); setActiveDropdown(null); }}
                                                        className={`px-4 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 ${dropoffLocation === loc ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : ''}`}
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
                            <div className="min-w-[140px]">
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Pickup</div>
                                <div className="border-b-2 border-blue-600 pb-2">
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
                            <div className="min-w-[140px]">
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Drop-off</div>
                                <div className="border-b-2 border-blue-600 pb-2">
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
                                className="bg-blue-600 text-white px-10 py-3 rounded-full font-bold text-lg hover:bg-blue-700 transition-all shadow-lg"
                            >
                                SEARCH CARS
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
                            <span><strong>Free Cancellation</strong> up to 24 hrs</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span><strong>Sanitized Cars</strong> for safety</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <span><strong>24x7 Support</strong> available</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                            </svg>
                            <span><strong>Doorstep Delivery</strong> available</span>
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
                        className="w-64 flex-shrink-0"
                    >
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 sticky top-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 dark:text-white text-lg">Filters</h3>
                                <button 
                                    onClick={() => setFilters({ carType: [], transmission: [], fuelType: [], brand: [], priceRange: [0, 10000] })}
                                    className="text-blue-600 text-sm font-medium hover:underline"
                                >
                                    CLEAR ALL
                                </button>
                            </div>

                            {/* Car Type */}
                            <div className="border-t dark:border-gray-700 pt-4 mb-4">
                                <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Car Type</h4>
                                <div className="space-y-2">
                                    {carTypes.map(type => (
                                        <label key={type.label} className="flex items-center justify-between cursor-pointer group">
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filters.carType.includes(type.label)}
                                                    onChange={() => toggleFilter('carType', type.label)}
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-600 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
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
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-600 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
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
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-600 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{type.label}</span>
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
                                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-600 dark:bg-gray-700" 
                                                />
                                                <span className="text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{brand.label}</span>
                                            </div>
                                            <span className="text-gray-400 text-sm">({brand.count})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.aside>

                    {/* Main Content - Car List */}
                    <main className="flex-1">
                        {/* Results Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{cars.length} Cars Available</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Sort by:</span>
                                <select 
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="border dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                                >
                                    {sortOptions.map(opt => (
                                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Car Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cars.map((car, idx) => (
                                <motion.div
                                    key={car.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
                                    className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border-2 dark:border-gray-700 transition-all ${!car.available ? 'opacity-60' : 'hover:border-blue-300 dark:hover:border-blue-500'}`}
                                >
                                    {/* Car Image */}
                                    <div className="relative h-48 bg-gray-100 dark:bg-gray-700">
                                        <img 
                                            src={car.image} 
                                            alt={car.name} 
                                            className="w-full h-full object-cover"
                                        />
                                        {!car.available && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold">SOLD OUT</span>
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3 flex gap-2">
                                            <span className={`${car.fuelColor} text-white text-xs px-2 py-1 rounded font-medium`}>
                                                {car.fuelType}
                                            </span>
                                            <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded font-medium">
                                                {car.transmission}
                                            </span>
                                        </div>
                                        <div className="absolute top-3 right-3 bg-white rounded-full px-2 py-1 flex items-center gap-1 shadow">
                                            <svg className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span className="text-sm font-bold">{car.rating}</span>
                                            <span className="text-xs text-gray-500">({car.reviewCount})</span>
                                        </div>
                                    </div>

                                    {/* Car Details */}
                                    <div className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{car.brand} {car.name}</h3>
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">{car.category}</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-gray-800 dark:text-white">₹{Math.round(getPrice(car)).toLocaleString()}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{getPriceLabel()}</div>
                                            </div>
                                        </div>

                                        {/* Features */}
                                        <div className="flex items-center gap-4 mt-3 text-gray-600 dark:text-gray-400 text-sm">
                                            <span className="flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                {car.seats} Seats
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                </svg>
                                                {car.luggage} Bags
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                {car.mileage}
                                            </span>
                                        </div>

                                        {/* KM Limit & Deposit */}
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span>{car.kmLimit} included</span>
                                            <span>•</span>
                                            <span>₹{car.extraKmCharge}/km extra</span>
                                            <span>•</span>
                                            <span>₹{car.securityDeposit.toLocaleString()} deposit</span>
                                        </div>

                                        {/* Features Tags */}
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {car.features.slice(0, 3).map((feature, i) => (
                                                <span key={i} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-1 rounded">
                                                    {feature}
                                                </span>
                                            ))}
                                            {car.features.length > 3 && (
                                                <span className="text-blue-600 text-xs px-2 py-1">
                                                    +{car.features.length - 3} more
                                                </span>
                                            )}
                                        </div>

                                        {/* Book Button */}
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            disabled={!car.available}
                                            className={`w-full mt-4 py-3 rounded-lg font-bold transition-all ${
                                                car.available
                                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-md'
                                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            }`}
                                        >
                                            {car.available ? 'BOOK NOW' : 'NOT AVAILABLE'}
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

export default CarRental;
