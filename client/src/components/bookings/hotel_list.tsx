import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';
import Header2 from '../mvpblocks/Header-2';

interface Hotel {
    id: number;
    name: string;
    location: string;
    distance: string;
    starRating: number;
    userRating: number;
    ratingText: string;
    reviewCount: number;
    originalPrice: number;
    price: number;
    taxes: number;
    images: string[];
    description: string;
    tags: string[];
    bankOffer?: string;
    isLimitedOffer?: boolean;
}

interface RushDeal {
    id: number;
    name: string;
    location: string;
    starRating: number;
    originalPrice: number;
    price: number;
    image: string;
}

const HotelList: React.FC = () => {
    const [hotels, setHotels] = useState<Hotel[]>([]);
    const [rushDeals, setRushDeals] = useState<RushDeal[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('popularity');
    const [searchLocation, setSearchLocation] = useState('Darjeeling');
    const [checkIn, setCheckIn] = useState('Thu, 11 Dec 2025');
    const [checkOut, setCheckOut] = useState('Mon, 5 Jan 2026');
    const [roomsGuests, setRoomsGuests] = useState('1 Room, 2 Adults');
    const [rushDealTime, setRushDealTime] = useState({ hours: 8, minutes: 1, seconds: 42 });
    const [showLongStayBenefits, _setShowLongStayBenefits] = useState(true);
    const rushDealsRef = useRef<HTMLDivElement>(null);

    // Dropdown states
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [locationSearch, setLocationSearch] = useState('');
    const [rooms, setRooms] = useState(1);
    const [adults, setAdults] = useState(2);
    const [children, setChildren] = useState(0);
    const [checkInDate, setCheckInDate] = useState(new Date(2025, 11, 11));
    const [checkOutDate, setCheckOutDate] = useState(new Date(2026, 0, 5));
    const [calendarMonth, setCalendarMonth] = useState(new Date(2025, 11, 1));

    const popularCities = [
        { name: 'Darjeeling', state: 'West Bengal', trending: true },
        { name: 'Gangtok', state: 'Sikkim', trending: true },
        { name: 'Shimla', state: 'Himachal Pradesh', trending: true },
        { name: 'Manali', state: 'Himachal Pradesh', trending: false },
        { name: 'Goa', state: 'Goa', trending: true },
        { name: 'Jaipur', state: 'Rajasthan', trending: false },
        { name: 'Mumbai', state: 'Maharashtra', trending: false },
        { name: 'Delhi', state: 'Delhi', trending: false },
        { name: 'Bangalore', state: 'Karnataka', trending: false },
        { name: 'Kolkata', state: 'West Bengal', trending: false },
    ];

    const filteredCities = popularCities.filter(city => 
        city.name.toLowerCase().includes(locationSearch.toLowerCase()) ||
        city.state.toLowerCase().includes(locationSearch.toLowerCase())
    );

    const formatDate = (date: Date) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return { firstDay, daysInMonth };
    };

    const handleDateSelect = (day: number, isCheckIn: boolean) => {
        const selectedDate = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        if (isCheckIn) {
            setCheckInDate(selectedDate);
            setCheckIn(formatDate(selectedDate));
            if (selectedDate >= checkOutDate) {
                const nextDay = new Date(selectedDate);
                nextDay.setDate(nextDay.getDate() + 1);
                setCheckOutDate(nextDay);
                setCheckOut(formatDate(nextDay));
            }
        } else {
            if (selectedDate > checkInDate) {
                setCheckOutDate(selectedDate);
                setCheckOut(formatDate(selectedDate));
            }
        }
    };

    const handleCitySelect = (cityName: string) => {
        setSearchLocation(cityName);
        setActiveDropdown(null);
        setLocationSearch('');
    };

    const updateRoomsGuests = () => {
        setRoomsGuests(`${rooms} Room${rooms > 1 ? 's' : ''}, ${adults} Adult${adults > 1 ? 's' : ''}${children > 0 ? `, ${children} Child${children > 1 ? 'ren' : ''}` : ''}`);
    };

    useEffect(() => {
        updateRoomsGuests();
    }, [rooms, adults, children]);

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

    // Filters
    const [_filters, _setFilters] = useState({
        rushDeal: false,
        lastMinuteDeals: false,
        freeCancellation: false,
        breakfastIncluded: false,
        allMealsIncluded: false,
        priceRange: [] as string[],
        minBudget: '',
        maxBudget: '',
        starCategory: [] as number[],
        propertyType: [] as string[],
        topLocations: [] as string[],
    });

    const sortOptions = [
        { id: 'popularity', label: 'Popularity' },
        { id: 'priceLowHigh', label: 'Price (Low to High)' },
        { id: 'priceHighLow', label: 'Price (High to Low)' },
        { id: 'userRating', label: 'User Rating (Highest)' },
        { id: 'bestRated', label: 'Lowest Price & Best Rated' },
    ];

    const priceRanges = [
        { label: '₹ 0 - ₹ 1500', count: 58 },
        { label: '₹ 1500 - ₹ 2500', count: 92 },
        { label: '₹ 2500 - ₹ 5000', count: 83 },
        { label: '₹ 5000 - ₹ 8500', count: 21 },
        { label: '₹ 8500 - ₹ 12000', count: 7 },
        { label: '₹ 12000 - ₹ 15000', count: 4 },
        { label: '₹ 15000 - ₹ 30000', count: 1 },
        { label: '₹ 30000+', count: 2 },
    ];

    const propertyTypes = [
        { label: 'Homestay', count: 182 },
        { label: 'Hotel', count: 48 },
        { label: 'Apartment', count: 7 },
        { label: 'Hostel', count: 6 },
        { label: 'Resort', count: 5 },
    ];

    const topLocations = [
        { label: 'Mall Road', count: 45 },
        { label: 'Lepcha Jagat', count: 32 },
        { label: 'Chowrasta', count: 28 },
        { label: 'Tinchuley Village', count: 15 },
        { label: 'Chauk Bazaar', count: 12 },
    ];

    const suggestedFilters = [
        { id: 'rushDeal', label: 'Rush Deal', count: 53 },
        { id: 'lastMinuteDeals', label: 'Last Minute Deals', count: 38 },
        { id: 'freeCancellation', label: 'Free Cancellation', count: 4 },
        { id: 'breakfastIncluded', label: 'Breakfast Included', count: 125 },
        { id: 'allMealsIncluded', label: 'All Meals Included', count: 41 },
    ];

    // Countdown timer for Rush Deals
    useEffect(() => {
        const timer = setInterval(() => {
            setRushDealTime(prev => {
                let { hours, minutes, seconds } = prev;
                seconds--;
                if (seconds < 0) {
                    seconds = 59;
                    minutes--;
                }
                if (minutes < 0) {
                    minutes = 59;
                    hours--;
                }
                if (hours < 0) {
                    hours = 23;
                }
                return { hours, minutes, seconds };
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Sample hotel data matching MakeMyTrip style
        const sampleHotels: Hotel[] = [
            {
                id: 1,
                name: 'Banari Regency by Summit, Namchi',
                location: 'Namchi',
                distance: '90.9 km from Ravangla city centre',
                starRating: 4,
                userRating: 4.4,
                ratingText: 'Excellent',
                reviewCount: 150,
                originalPrice: 4541,
                price: 3633,
                taxes: 689,
                images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400', 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=200', 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=200'],
                description: 'Serene location near Chardham, spacious rooms with valley views, tasty food made on request',
                tags: ['Couple Friendly'],
                bankOffer: 'Axis Bank Credit Card NoCostEMI Offer - Get INR 30654 Off!',
            },
            {
                id: 2,
                name: 'Hotel Silver Star',
                location: 'Mall Road',
                distance: '840 m drive to Darjeeling Mall Road',
                starRating: 3,
                userRating: 4.0,
                ratingText: 'Very Good',
                reviewCount: 455,
                originalPrice: 7328,
                price: 4341,
                taxes: 689,
                images: ['https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400', 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=200', 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=200'],
                description: 'Beautiful mountain views, near Darjeeling station, vegetarian restaurant serving tasty dishes',
                tags: ['Mountain View', 'Near Station'],
                bankOffer: 'Axis Bank Credit Card NoCostEMI Offer - Get INR 22209 Off!',
                isLimitedOffer: true,
            },
            {
                id: 3,
                name: 'ORSINO RESORT MALL ROAD',
                location: 'Mall Road',
                distance: '500 m from Mall Road',
                starRating: 4,
                userRating: 4.2,
                ratingText: 'Very Good',
                reviewCount: 320,
                originalPrice: 16551,
                price: 7357,
                taxes: 1200,
                images: ['https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=400', 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=200', 'https://images.unsplash.com/photo-1562790351-d273a961e0e9?w=200'],
                description: 'Premium spa resort with stunning views, infinity pool, fine dining restaurant',
                tags: ['Spa', 'Pool', 'Fine Dining'],
                bankOffer: 'HDFC Bank Offer - Get 10% Instant Discount!',
            },
            {
                id: 4,
                name: 'Mount Lungta Boutique Hotel & Spa',
                location: 'Katapahar',
                distance: '2.5 km from city centre',
                starRating: 4,
                userRating: 4.5,
                ratingText: 'Excellent',
                reviewCount: 89,
                originalPrice: 6123,
                price: 4709,
                taxes: 750,
                images: ['https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=400', 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=200', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=200'],
                description: 'Boutique luxury with traditional architecture, spa treatments, panoramic mountain views',
                tags: ['Boutique', 'Spa', 'Mountain View'],
            },
            {
                id: 5,
                name: 'The Elgin Darjeeling',
                location: 'Chowrasta',
                distance: '200 m from Chowrasta',
                starRating: 5,
                userRating: 4.7,
                ratingText: 'Excellent',
                reviewCount: 520,
                originalPrice: 15000,
                price: 12500,
                taxes: 2000,
                images: ['https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=400', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=200', 'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?w=200'],
                description: 'Heritage property with colonial charm, award-winning restaurant, tea lounge',
                tags: ['Heritage', 'Luxury', 'Tea Lounge'],
                isLimitedOffer: true,
            },
        ];

        const sampleRushDeals: RushDeal[] = [
            { id: 1, name: 'Banari Regency by Summit, Namchi', location: 'In Namchi', starRating: 4, originalPrice: 4541, price: 3633, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300' },
            { id: 2, name: 'ORSINO RESORT MALL ROAD', location: 'Mall Road', starRating: 4, originalPrice: 16551, price: 7357, image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=300' },
            { id: 3, name: 'Mount Lungta Boutique Hotel & Spa', location: 'Katapahar', starRating: 4, originalPrice: 6123, price: 4709, image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=300' },
            { id: 4, name: 'Summit Grace Hotel', location: 'Ghoom', starRating: 3, originalPrice: 5500, price: 3999, image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=300' },
        ];

        setHotels(sampleHotels);
        setRushDeals(sampleRushDeals);
        setLoading(false);
    }, []);

    const scrollRushDeals = (direction: 'left' | 'right') => {
        if (rushDealsRef.current) {
            const scrollAmount = 300;
            rushDealsRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const renderStars = (count: number) => {
        return Array.from({ length: 5 }, (_, i) => (
            <svg key={i} className={`w-4 h-4 ${i < count ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
        ));
    };

    const getRatingColor = (rating: number) => {
        if (rating >= 4.5) return 'bg-green-600';
        if (rating >= 4.0) return 'bg-blue-600';
        if (rating >= 3.5) return 'bg-yellow-500';
        return 'bg-orange-500';
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-red-800 border-t-transparent rounded-full"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <Header1/>
             {/* Spacer for fixed header - matches dark header background */}
            <div className="h-10 bg-white dark:bg-black"></div>
            <Header2/>

            {/* Search Header */}
            <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-50 dark:border-b dark:border-gray-700"
            >
                <div className="max-w-7xl mx-auto px-4 py-4 relative">
                    <div className="search-dropdown-container flex items-stretch bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-visible">
                        {/* City, Area or Property */}
                        <div 
                            className={`relative flex-1 px-6 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-l-lg ${activeDropdown === 'location' ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                            onClick={() => setActiveDropdown(activeDropdown === 'location' ? null : 'location')}
                        >
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">City, Area or Property</div>
                            <div className="font-bold text-lg text-gray-800 dark:text-white mt-1">{searchLocation}</div>
                            
                            {/* Location Dropdown */}
                            <AnimatePresence>
                                {activeDropdown === 'location' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute top-full left-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="bg-red-800 text-white px-4 py-3 flex items-center justify-between">
                                            <span className="font-medium">Select City</span>
                                            <button 
                                                onClick={() => { setLocationSearch(''); }}
                                                className="text-sm hover:underline"
                                            >
                                                CLEAR
                                            </button>
                                        </div>
                                        <div className="p-3 border-b dark:border-gray-700">
                                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
                                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                                                </svg>
                                                <input
                                                    type="text"
                                                    placeholder="Search for city, area or property"
                                                    value={locationSearch}
                                                    onChange={(e) => setLocationSearch(e.target.value)}
                                                    className="flex-1 bg-transparent outline-none text-sm dark:text-white dark:placeholder-gray-400"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">POPULAR DESTINATIONS</div>
                                            <div className="max-h-64 overflow-y-auto space-y-1">
                                                {filteredCities.map((city) => (
                                                    <div
                                                        key={city.name}
                                                        onClick={() => handleCitySelect(city.name)}
                                                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                                                    >
                                                        {city.trending ? (
                                                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                        )}
                                                        <div>
                                                            <div className="font-medium text-gray-800 dark:text-white">{city.name}</div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">{city.state}, India</div>
                                                        </div>
                                                        {city.trending && (
                                                            <span className="ml-auto text-xs text-red-500 font-medium">Trending</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Check-In */}
                        <div 
                            className={`relative px-6 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${activeDropdown === 'checkin' ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                            onClick={() => setActiveDropdown(activeDropdown === 'checkin' ? null : 'checkin')}
                        >
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Check-In</div>
                            <div className="font-bold text-gray-800 dark:text-white mt-1">{checkIn}</div>
                            
                            {/* Check-In Calendar */}
                            <AnimatePresence>
                                {activeDropdown === 'checkin' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 p-5 w-[350px]"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <button 
                                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                                                className="p-2 hover:bg-gray-100 rounded-full"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                            <span className="font-bold text-gray-800 text-lg">
                                                {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                            </span>
                                            <button 
                                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                                                className="p-2 hover:bg-gray-100 rounded-full"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-gray-500 mb-3">
                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                                <div key={day} className="w-11 h-9 flex items-center justify-center">{day}</div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1">
                                            {Array.from({ length: getDaysInMonth(calendarMonth).firstDay }, (_, i) => (
                                                <div key={`empty-${i}`} className="w-11 h-11" />
                                            ))}
                                            {Array.from({ length: getDaysInMonth(calendarMonth).daysInMonth }, (_, i) => {
                                                const day = i + 1;
                                                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                                                const isSelected = date.toDateString() === checkInDate.toDateString();
                                                const isPast = date < new Date(new Date().setHours(0,0,0,0));
                                                return (
                                                    <button
                                                        key={day}
                                                        disabled={isPast}
                                                        onClick={() => handleDateSelect(day, true)}
                                                        className={`w-11 h-11 rounded-full text-sm font-medium transition-colors ${
                                                            isSelected 
                                                                ? 'bg-red-800 text-white' 
                                                                : isPast 
                                                                    ? 'text-gray-300 cursor-not-allowed' 
                                                                    : 'hover:bg-red-100 text-gray-700'
                                                        }`}
                                                    >
                                                        {day}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Check-Out */}
                        <div 
                            className={`relative px-6 py-3 border-r border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${activeDropdown === 'checkout' ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                            onClick={() => setActiveDropdown(activeDropdown === 'checkout' ? null : 'checkout')}
                        >
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Check-Out</div>
                            <div className="font-bold text-gray-800 dark:text-white mt-1">{checkOut}</div>
                            
                            {/* Check-Out Calendar */}
                            <AnimatePresence>
                                {activeDropdown === 'checkout' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 p-5 w-[350px]"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <button 
                                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                                                className="p-2 hover:bg-gray-100 rounded-full"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                            <span className="font-bold text-gray-800 dark:text-white text-lg">
                                                {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                            </span>
                                            <button 
                                                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full dark:text-gray-300"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                                <div key={day} className="w-11 h-9 flex items-center justify-center">{day}</div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1">
                                            {Array.from({ length: getDaysInMonth(calendarMonth).firstDay }, (_, i) => (
                                                <div key={`empty-${i}`} className="w-11 h-11" />
                                            ))}
                                            {Array.from({ length: getDaysInMonth(calendarMonth).daysInMonth }, (_, i) => {
                                                const day = i + 1;
                                                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                                                const isSelected = date.toDateString() === checkOutDate.toDateString();
                                                const isBeforeCheckIn = date <= checkInDate;
                                                return (
                                                    <button
                                                        key={day}
                                                        disabled={isBeforeCheckIn}
                                                        onClick={() => handleDateSelect(day, false)}
                                                        className={`w-11 h-11 rounded-full text-sm font-medium transition-colors ${
                                                            isSelected 
                                                                ? 'bg-red-800 text-white' 
                                                                : isBeforeCheckIn 
                                                                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                                                                    : 'hover:bg-red-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        {day}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Rooms & Guests */}
                        <div 
                            className={`relative px-6 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${activeDropdown === 'guests' ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                            onClick={() => setActiveDropdown(activeDropdown === 'guests' ? null : 'guests')}
                        >
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">Rooms & Guests</div>
                            <div className="font-bold text-gray-800 dark:text-white mt-1">{roomsGuests}</div>
                            
                            {/* Rooms & Guests Dropdown */}
                            <AnimatePresence>
                                {activeDropdown === 'guests' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 p-4"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Rooms */}
                                        <div className="flex items-center justify-between py-3 border-b dark:border-gray-700">
                                            <div>
                                                <div className="font-medium text-gray-800 dark:text-white">Rooms</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => setRooms(Math.max(1, rooms - 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={rooms <= 1}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                                    </svg>
                                                </button>
                                                <span className="w-8 text-center font-bold dark:text-white">{rooms}</span>
                                                <button 
                                                    onClick={() => setRooms(Math.min(8, rooms + 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={rooms >= 8}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Adults */}
                                        <div className="flex items-center justify-between py-3 border-b dark:border-gray-700">
                                            <div>
                                                <div className="font-medium text-gray-800 dark:text-white">Adults</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">12+ years</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => setAdults(Math.max(1, adults - 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={adults <= 1}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                                    </svg>
                                                </button>
                                                <span className="w-8 text-center font-bold dark:text-white">{adults}</span>
                                                <button 
                                                    onClick={() => setAdults(Math.min(8, adults + 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={adults >= 8}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Children */}
                                        <div className="flex items-center justify-between py-3">
                                            <div>
                                                <div className="font-medium text-gray-800 dark:text-white">Children</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">0-11 years</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button 
                                                    onClick={() => setChildren(Math.max(0, children - 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={children <= 0}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                                    </svg>
                                                </button>
                                                <span className="w-8 text-center font-bold dark:text-white">{children}</span>
                                                <button 
                                                    onClick={() => setChildren(Math.min(6, children + 1))}
                                                    className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-300"
                                                    disabled={children >= 6}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Apply Button */}
                                        <button 
                                            onClick={() => setActiveDropdown(null)}
                                            className="w-full mt-4 bg-gradient-to-r from-red-800 to-red-900 text-white py-3 rounded-lg font-bold hover:from-red-900 hover:to-red-950 transition-all"
                                        >
                                            APPLY
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Search Button */}
                        <div className="flex items-center px-4">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="bg-gradient-to-r from-red-800 to-red-900 text-white px-10 py-3 rounded-full font-bold text-base hover:from-red-900 hover:to-red-950 transition-all shadow-md"
                            >
                                SEARCH
                            </motion.button>
                        </div>
                    </div>
                </div>
            </motion.div>

            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-6">
                    {/* Left Sidebar - Filters */}
                    <motion.aside 
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-72 flex-shrink-0"
                    >
                        {/* Map Section */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 overflow-hidden border border-gray-100 dark:border-gray-700">
                            <div className="h-32 bg-gradient-to-br from-blue-100 to-blue-200 relative">
                                <img src="https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/88.2627,27.0410,12,0/280x128?access_token=pk.placeholder" alt="Map" className="w-full h-full object-cover opacity-60" loading="lazy" />
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-800 to-red-900 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-md"
                                >
                                    EXPLORE ON MAP
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                                </motion.button>
                            </div>
                            <div className="p-3">
                                <div className="flex items-center gap-2 border dark:border-gray-700 rounded-lg px-3 py-2">
                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                    <input type="text" placeholder="Search for locality / hotel name" className="flex-1 text-sm focus:outline-none bg-transparent dark:text-white dark:placeholder-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Suggested For You */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Suggested For You</h3>
                            <div className="space-y-3">
                                {suggestedFilters.map(filter => (
                                    <label key={filter.id} className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-800 focus:ring-red-800 dark:bg-gray-700" />
                                        <span className="text-gray-700 dark:text-gray-300 group-hover:text-red-800 dark:group-hover:text-red-400 transition-colors">{filter.label}</span>
                                        <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">({filter.count})</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Price per night */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Price per night</h3>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {priceRanges.map((range, idx) => (
                                    <label key={idx} className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-800 focus:ring-red-800 dark:bg-gray-700" />
                                        <span className="text-gray-700 dark:text-gray-300 group-hover:text-red-800 dark:group-hover:text-red-400 transition-colors text-sm">{range.label}</span>
                                        <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">({range.count})</span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-4">
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Budget</div>
                                <div className="flex items-center gap-2">
                                    <input type="text" placeholder="Min" className="w-20 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-800 bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" />
                                    <span className="text-gray-400">to</span>
                                    <input type="text" placeholder="Max" className="w-20 px-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-800 bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" />
                                    <motion.button whileHover={{ scale: 1.1 }} className="bg-gradient-to-r from-red-800 to-red-900 text-white p-2 rounded-lg shadow-sm">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                    </motion.button>
                                </div>
                            </div>
                        </div>

                        {/* Star Category */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Star Category</h3>
                            <div className="flex flex-wrap gap-2">
                                {[5, 4, 3, 2, 1].map(star => (
                                    <motion.button
                                        key={star}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="flex items-center gap-1 px-3 py-1.5 border dark:border-gray-600 rounded-full text-sm hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors dark:text-gray-300"
                                    >
                                        {star} <svg className="w-3 h-3 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Property Type */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Property Type</h3>
                            <div className="space-y-2">
                                {propertyTypes.map((type, idx) => (
                                    <label key={idx} className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-800 focus:ring-red-800 dark:bg-gray-700" />
                                        <span className="text-gray-700 dark:text-gray-300 group-hover:text-red-800 dark:group-hover:text-red-400 transition-colors">{type.label}</span>
                                        <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">({type.count})</span>
                                    </label>
                                ))}
                            </div>
                            <button className="text-red-800 text-sm font-medium mt-3 hover:underline">Show 3 more</button>
                        </div>

                        {/* Top Locations */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-3">Top locations</h3>
                            <div className="space-y-2">
                                {topLocations.map((loc, idx) => (
                                    <label key={idx} className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-800 focus:ring-red-800 dark:bg-gray-700" />
                                        <span className="text-gray-700 dark:text-gray-300 group-hover:text-red-800 dark:group-hover:text-red-400 transition-colors">{loc.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </motion.aside>

                    {/* Main Content */}
                    <main className="flex-1">
                        {/* Breadcrumb and Header */}
                        <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="mb-4"
                        >
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                                <a href="#" className="text-red-800 dark:text-red-400 hover:underline">Home</a>
                                <span>{'>'}</span>
                                <span>Hotels and more in {searchLocation}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">268 Properties in {searchLocation}</h1>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    className="flex items-center gap-2 px-4 py-2 border dark:border-gray-700 rounded-full text-sm hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300"
                                >
                                    <svg className="w-5 h-5 text-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                    Explore Travel Tips →
                                </motion.button>
                            </div>
                        </motion.div>

                        {/* Sort Options */}
                        <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 mb-4 flex items-center gap-2 overflow-x-auto border border-gray-100 dark:border-gray-700"
                        >
                            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            {sortOptions.map(option => (
                                <motion.button
                                    key={option.id}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSortBy(option.id)}
                                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                        sortBy === option.id 
                                            ? 'text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800' 
                                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-red-800 dark:hover:text-red-400'
                                    }`}
                                >
                                    {option.label}
                                </motion.button>
                            ))}
                            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full ml-auto">
                                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </motion.div>

                        {/* Long Stay Benefits Banner */}
                        <AnimatePresence>
                            {showLongStayBenefits && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-xl p-4 mb-4 border border-emerald-200 dark:border-emerald-800"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-sm font-medium">Long Stay Benefits</span>
                                            <p className="mt-2 text-gray-700 dark:text-gray-300">
                                                Get exclusive <span className="font-bold">discounts and benefits</span> for extended stays of 3 nights and more!
                                            </p>
                                            <a href="#" className="text-red-800 dark:text-red-400 font-semibold hover:underline">See Properties with Long Stay Benefits</a>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" />
                                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-800"></div>
                                        </label>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Rush Deals Section */}
                        <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4 border-2 border-red-800"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="bg-gradient-to-r from-red-800 to-red-900 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                                        {String(rushDealTime.hours).padStart(2, '0')}h : {String(rushDealTime.minutes).padStart(2, '0')}m : {String(rushDealTime.seconds).padStart(2, '0')}s
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                        <span className="text-xl font-bold text-gray-800 dark:text-white">Rush Deals</span>
                                        <span className="text-gray-500 dark:text-gray-400">| Extra savings over our best deal</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <a href="#" className="text-red-800 dark:text-red-400 font-medium hover:underline flex items-center gap-1">
                                        View All <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                                    </a>
                                    <button onClick={() => scrollRushDeals('left')} className="p-2 border dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    </button>
                                    <button onClick={() => scrollRushDeals('right')} className="p-2 border dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div ref={rushDealsRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                {rushDeals.map((deal, idx) => (
                                    <motion.div
                                        key={deal.id}
                                        initial={{ opacity: 0, x: 50 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        whileHover={{ y: -5, boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
                                        className="flex-shrink-0 w-56 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 overflow-hidden cursor-pointer hover:border-red-800 transition-colors"
                                    >
                                        <div className="h-36 overflow-hidden">
                                            <img src={deal.image} alt={deal.name} className="w-full h-full object-cover hover:scale-110 transition-transform duration-300" loading="lazy" />
                                        </div>
                                        <div className="p-3">
                                            <h4 className="font-bold text-gray-800 dark:text-white text-sm line-clamp-2">{deal.name}</h4>
                                            <div className="flex items-center gap-1 my-1">
                                                {renderStars(deal.starRating)}
                                            </div>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">{deal.location}</p>
                                            <div className="flex items-center justify-between mt-2">
                                                <div>
                                                    <span className="text-gray-400 text-sm line-through">₹{deal.originalPrice.toLocaleString()}</span>
                                                    <div className="text-lg font-bold text-gray-800 dark:text-white">₹{deal.price.toLocaleString()}</div>
                                                </div>
                                                <span className="text-gray-500 dark:text-gray-400 text-xs">Per Night</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Hotel Listings Title */}
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Showing Properties in {searchLocation}</h2>

                        {/* Hotel Cards */}
                        <div className="space-y-4">
                            {hotels.map((hotel, idx) => (
                                <motion.div
                                    key={hotel.id}
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    whileHover={{ boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
                                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border dark:border-gray-700 hover:border-red-800 transition-all"
                                >
                                    <div className="flex">
                                        {/* Image Section */}
                                        <div className="w-72 flex-shrink-0 p-4">
                                            <div className="relative h-44 rounded-lg overflow-hidden">
                                                <motion.img 
                                                    whileHover={{ scale: 1.05 }}
                                                    transition={{ duration: 0.3 }}
                                                    src={hotel.images[0]} 
                                                    alt={hotel.name} 
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <div className="flex gap-2 mt-2">
                                                {hotel.images.slice(1, 4).map((img, i) => (
                                                    <div key={i} className="w-14 h-10 rounded overflow-hidden">
                                                        <img src={img} alt="" className="w-full h-full object-cover hover:opacity-80 transition-opacity cursor-pointer" loading="lazy" />
                                                    </div>
                                                ))}
                                                <div className="w-14 h-10 rounded bg-gray-800 flex items-center justify-center text-white text-xs font-medium cursor-pointer hover:bg-gray-700">
                                                    View All
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content Section */}
                                        <div className="flex-1 p-4 flex">
                                            <div className="flex-1">
                                                <div className="flex items-start gap-2">
                                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white hover:text-red-800 dark:hover:text-red-400 cursor-pointer transition-colors">{hotel.name}</h3>
                                                    <div className="flex items-center gap-0.5">
                                                        {renderStars(hotel.starRating)}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <a href="#" className="text-red-800 dark:text-red-400 text-sm hover:underline">{hotel.location}</a>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="text-orange-500 dark:text-orange-400 text-sm">{hotel.distance}</span>
                                                </div>
                                                <div className="flex items-start gap-2 mt-3">
                                                    <svg className="w-4 h-4 text-red-800 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" /></svg>
                                                    <p className="text-gray-600 dark:text-gray-300 text-sm">{hotel.description}</p>
                                                </div>
                                                <div className="flex gap-2 mt-3">
                                                    {hotel.tags.map((tag, i) => (
                                                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Price Section */}
                                            <div className="w-48 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className={`text-sm font-medium ${hotel.userRating >= 4.5 ? 'text-green-600' : 'text-blue-600'}`}>
                                                        {hotel.ratingText}
                                                    </span>
                                                    <span className={`${getRatingColor(hotel.userRating)} text-white px-2 py-1 rounded text-sm font-bold`}>
                                                        {hotel.userRating}
                                                    </span>
                                                </div>
                                                <div className="text-gray-500 dark:text-gray-400 text-sm">({hotel.reviewCount} Ratings)</div>
                                                
                                                {hotel.isLimitedOffer && (
                                                    <motion.div 
                                                        animate={{ scale: [1, 1.05, 1] }}
                                                        transition={{ repeat: Infinity, duration: 2 }}
                                                        className="mt-2 text-red-800 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded inline-block"
                                                    >
                                                        Limited Time Offer
                                                    </motion.div>
                                                )}
                                                
                                                <div className="mt-2">
                                                    <span className="text-gray-400 text-sm line-through">₹ {hotel.originalPrice.toLocaleString()}</span>
                                                </div>
                                                <div className="text-2xl font-bold text-gray-800 dark:text-white">₹ {hotel.price.toLocaleString()}</div>
                                                <div className="text-gray-500 dark:text-gray-400 text-xs">+ ₹ {hotel.taxes} taxes & fees</div>
                                                <div className="text-gray-500 dark:text-gray-400 text-xs">Per Night</div>
                                                
                                                <motion.a 
                                                    whileHover={{ scale: 1.02 }}
                                                    href="#" 
                                                    className="text-red-800 dark:text-red-400 text-sm font-medium mt-2 inline-block hover:underline"
                                                >
                                                    Login to Book Now & Pay Later!
                                                </motion.a>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bank Offer Banner */}
                                    {hotel.bankOffer && (
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 px-4 py-2 text-emerald-700 dark:text-emerald-400 text-sm border-t border-emerald-100 dark:border-emerald-800"
                                        >
                                            {hotel.bankOffer}
                                        </motion.div>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        {/* Load More Button */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex justify-center mt-8"
                        >
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="px-12 py-4 bg-gradient-to-r from-red-800 to-red-900 text-white rounded-full font-bold hover:from-red-900 hover:to-red-950 transition-all shadow-lg hover:shadow-xl"
                            >
                                Load More Properties
                            </motion.button>
                        </motion.div>
                    </main>
                </div>
            </div>
        </div>
    );
};

export default HotelList;