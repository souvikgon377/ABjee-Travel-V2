import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';
import Footer4Col from '../mvpblocks/footer-4col';
import { GroupToursPopup } from './GroupToursPopup';
import Header2 from '../mvpblocks/Header-2';

// --- TYPE DEFINITIONS ---
interface TourPackage {
  id: number;
  image: string;
  name: string;
  duration: string;
  price: string;
  rating: number;
}

interface Testimonial {
  id: number;
  quote: string;
  name: string;
  location: string;
  avatar: string;
}

interface TourCategory {
    id: number;
    icon: React.ReactNode;
    name: string;
    description: string;
}

interface TrendingHoliday {
  id: number;
  name: string;
  image: string;
  tours: number;
  departures: number;
  guests: number;
}


// --- SVG ICONS (for simplicity, instead of a library) ---
const icons = {
  menu: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
  mapPin: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
  calendar: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>,
  briefcase: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  star: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  users: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  user: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  heart: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  award: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  chevronLeft: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  chevronRight: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
};

// --- MOCK DATA ---
const tourPackages: TourPackage[] = [
  { id: 1, image: 'https://placehold.co/600x400/003366/FFFFFF?text=Europe', name: 'Spectacular Europe Adventure', duration: '10 Days / 9 Nights', price: '$2,499', rating: 5 },
  { id: 2, image: 'https://placehold.co/600x400/660066/FFFFFF?text=Japan', name: 'Cherry Blossom Season in Japan', duration: '7 Days / 6 Nights', price: '$3,199', rating: 5 },
  { id: 3, image: 'https://placehold.co/600x400/336600/FFFFFF?text=Kerala', name: 'Kerela Backwaters & Serenity', duration: '5 Days / 4 Nights', price: '$799', rating: 4 },
  { id: 4, image: 'https://placehold.co/600x400/993300/FFFFFF?text=Dubai', name: 'Dubai Extravaganza', duration: '6 Days / 5 Nights', price: '$1,899', rating: 5 },
];

const testimonials: Testimonial[] = [
  { id: 1, quote: "The Europe trip was a dream come true! ABjee's planning was meticulous, and our tour manager was fantastic. Highly recommended!", name: 'Rohan Sharma', location: 'Mumbai, India', avatar: 'https://placehold.co/100x100/EFEFEF/333333?text=RS' },
  { id: 2, quote: "Our family had an unforgettable time in Kerala. The houseboat experience was the highlight. Everything was seamless, from booking to the final day.", name: 'Priya Patel', location: 'Ahmedabad, India', avatar: 'https://placehold.co/100x100/EFEFEF/333333?text=PP' },
  { id: 3, quote: "I've traveled with many agencies, but the professionalism and personal touch from ABjee are unmatched. The Japan tour was perfectly paced.", name: 'Anjali Desai', location: 'Pune, India', avatar: 'https://placehold.co/100x100/EFEFEF/333333?text=AD' },
];

const tourCategories: TourCategory[] = [
    { id: 1, icon: icons.user, name: 'Individual Tour', description: 'Join fellow travelers for an exciting journey.' },
    { id: 2, icon: icons.heart, name: 'Couple / Family Tour', description: 'Create romantic memories that last a lifetime.' },
    { id: 3, icon: icons.users, name: 'Group Tour', description: 'Team building and leisure for your company.' },
    { id: 4, icon: icons.briefcase, name: 'Corporate Tour', description: 'Unique experiences tailored to your interests.' },
];

const trendingHolidays: TrendingHoliday[] = [
    { id: 1, name: 'Andaman', image: 'https://placehold.co/400x300/0D9488/FFFFFF?text=Andaman', tours: 5, departures: 156, guests: 27951 },
    { id: 2, name: 'Kashmir', image: 'https://placehold.co/400x300/3B82F6/FFFFFF?text=Kashmir', tours: 13, departures: 99, guests: 130148 },
    { id: 3, name: 'Himachal', image: 'https://placehold.co/400x300/6366F1/FFFFFF?text=Himachal', tours: 16, departures: 160, guests: 212000 },
    { id: 4, name: 'North East', image: 'https://placehold.co/400x300/16A34A/FFFFFF?text=North+East', tours: 4, departures: 77, guests: 4397 },
    { id: 5, name: 'Sikkim Darjeeling', image: 'https://placehold.co/400x300/0891B2/FFFFFF?text=Sikkim', tours: 6, departures: 54, guests: 29599 },
    { id: 6, name: 'Leh Ladakh', image: 'https://placehold.co/400x300/CA8A04/FFFFFF?text=Ladakh', tours: 2, departures: 2, guests: 22979 },
    { id: 7, name: 'Africa', image: 'https://placehold.co/400x300/D97706/FFFFFF?text=Africa', tours: 3, departures: 8, guests: 3523 },
    { id: 8, name: 'America', image: 'https://placehold.co/400x300/4F46E5/FFFFFF?text=America', tours: 6, departures: 6, guests: 18321 },
    { id: 9, name: 'Dubai and MiddleEast', image: 'https://placehold.co/400x300/57534E/FFFFFF?text=Dubai', tours: 11, departures: 137, guests: 45661 },
    { id: 10, name: 'Nepal', image: 'https://placehold.co/400x300/BE185D/FFFFFF?text=Nepal', tours: 3, departures: 37, guests: 11997 },
    { id: 11, name: 'South East Asia', image: 'https://placehold.co/400x300/047857/FFFFFF?text=Asia', tours: 29, departures: 318, guests: 221189 },
    { id: 12, name: 'Europe', image: 'https://placehold.co/400x300/7C3AED/FFFFFF?text=Europe', tours: 15, departures: 40, guests: 124383 },
];


// --- MAIN BOOKINGS COMPONENT ---
export default function BookingCategories() {
  
  const [isGroupToursOpen, setIsGroupToursOpen] = useState(false);
  
  const [currentIndex, setCurrentIndex] = useState(0);

  // Hotel Search State
  const [activeTab, setActiveTab] = useState('hotels');
  const [location, setLocation] = useState({ city: 'Goa', country: 'India' });
  const [checkIn, setCheckIn] = useState(new Date());
  const [checkOut, setCheckOut] = useState(new Date(Date.now() + 86400000)); // Tomorrow
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [travellingWithPets, setTravellingWithPets] = useState(false);
  const [priceRange, setPriceRange] = useState('₹0-₹1500');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showRoomsDropdown, setShowRoomsDropdown] = useState(false);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(new Date());
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');

  // Ref for search form to detect clicks outside
  const searchFormRef = useRef<HTMLDivElement>(null);

  // Close all dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchFormRef.current && !searchFormRef.current.contains(event.target as Node)) {
        setShowLocationDropdown(false);
        setShowRoomsDropdown(false);
        setShowPriceDropdown(false);
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const bookingTabs = [
    { id: 'flights', name: 'Flights', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg> },
    { id: 'hotels', name: 'Hotels', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="m9 16 .348-.24c1.465-1.013 3.84-1.013 5.304 0L15 16"/><path d="M8 7h.01"/><path d="M16 7h.01"/><path d="M12 7h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/><path d="M10 22v-6.5m4 0V22"/></svg> },
    { id: 'homestays', name: 'Homestays & Villas', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id: 'holidays', name: 'Holiday Packages', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg> },
    { id: 'trains', name: 'Trains', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="8" height="16" x="8" y="4" rx="1"/><path d="M12 20v2"/><path d="M8 20h8"/><path d="M12 4V2"/><circle cx="12" cy="16" r="1"/><path d="M10 8h4"/><path d="M10 12h4"/></svg> },
    { id: 'buses', name: 'Buses', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M6 18h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg> },
    { id: 'cabs', name: 'Cabs', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg> },
    { id: 'tours', name: 'Tours & Attractions', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>, badge: 'new' },
    { id: 'visa', name: 'Visa', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg> },
    { id: 'cruise', name: 'Cruise', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 10v4"/><path d="M12 2v3"/></svg> },
    { id: 'forex', name: 'Forex Card & Currency', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8"/><line x1="3" x2="6" y1="3" y2="6"/><line x1="21" x2="18" y1="3" y2="6"/><line x1="3" x2="6" y1="21" y2="18"/><line x1="21" x2="18" y1="21" y2="18"/></svg>, badge: 'new' },
    { id: 'insurance', name: 'Travel Insurance', icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg> },
  ];

  const popularLocations = [
    { city: 'Dubai', country: 'United Arab Emirates' },
    { city: 'Mumbai', country: 'India' },
    { city: 'Bangkok', country: 'Thailand' },
    { city: 'Singapore', country: 'Singapore' },
    { city: 'Goa', country: 'India' },
    { city: 'Bali', country: 'Indonesia' },
  ];

  const priceRanges = [
    '₹0-₹1500',
    '₹1500-₹2500',
    '₹2500-₹5000',
    '₹5000-₹10000',
    '₹10000+',
  ];

  // Holiday data
  const holidays: { [key: string]: { name: string; color: string } } = {
    '2025-12-25': { name: 'Chris...', color: 'text-orange-500' },
    '2025-12-26': { name: 'Chris...', color: 'text-orange-500' },
    '2025-12-27': { name: 'Chris...', color: 'text-orange-500' },
    '2025-12-28': { name: 'Chris...', color: 'text-orange-500' },
    '2026-01-01': { name: 'New...', color: 'text-orange-500' },
    '2026-01-02': { name: 'New...', color: 'text-orange-500' },
    '2026-01-03': { name: 'New...', color: 'text-orange-500' },
    '2026-01-23': { name: 'Basa...', color: 'text-orange-500' },
    '2026-01-24': { name: 'Basa...', color: 'text-orange-500' },
    '2026-01-25': { name: 'Repu...', color: 'text-orange-500' },
    '2026-01-26': { name: 'Repu...', color: 'text-orange-500' },
  };

  const holidayLegend = [
    { dates: '25 Dec-28 Dec', name: 'Christmas', color: 'bg-orange-500' },
    { dates: '01 Jan-04 Jan', name: 'New Year', color: 'bg-orange-500' },
    { dates: '23 Jan-25 Jan', name: 'Basant Panchami', color: 'bg-orange-500' },
    { dates: '24 Jan-26 Jan', name: 'Republic Day', color: 'bg-orange-500' },
  ];

  const formatDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    const weekday = date.toLocaleString('default', { weekday: 'long' });
    return { day, month, year, weekday };
  };

  const formatDateFull = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    return `${day} ${month} ${year}`;
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  };

  const isInRange = (date: Date) => {
    return date > checkIn && date < checkOut;
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleDateClick = (date: Date) => {
    if (isPastDate(date)) return;
    
    if (!selectingCheckOut) {
      setCheckIn(date);
      setCheckOut(new Date(date.getTime() + 86400000));
      setSelectingCheckOut(true);
    } else {
      if (date <= checkIn) {
        setCheckIn(date);
        setCheckOut(new Date(date.getTime() + 86400000));
      } else {
        setCheckOut(date);
        setSelectingCheckOut(false);
        setShowDatePicker(false);
      }
    }
  };

  const nextMonth = () => {
    setDatePickerMonth(new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    const today = new Date();
    const prevMonthDate = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() - 1, 1);
    if (prevMonthDate >= new Date(today.getFullYear(), today.getMonth(), 1)) {
      setDatePickerMonth(prevMonthDate);
    }
  };

  const renderCalendarMonth = (monthDate: Date) => {
    const daysInMonth = getDaysInMonth(monthDate);
    const firstDay = getFirstDayOfMonth(monthDate);
    const days = [];
    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    // Empty cells for days before the first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 w-10"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const dateKey = getDateKey(date);
      const holiday = holidays[dateKey];
      const isCheckInDate = isSameDay(date, checkIn);
      const isCheckOutDate = isSameDay(date, checkOut);
      const isRangeDate = isInRange(date);
      const isPast = isPastDate(date);

      days.push(
        <div
          key={day}
          onClick={() => !isPast && handleDateClick(date)}
          className={`relative h-10 w-10 flex flex-col items-center justify-center text-sm cursor-pointer rounded-lg transition-all
            ${isPast ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-blue-100 dark:hover:bg-blue-900/40 dark:text-gray-200'}
            ${isCheckInDate || isCheckOutDate ? 'bg-blue-500 text-white rounded-lg' : ''}
            ${isRangeDate ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
          `}
        >
          <span className={`${isCheckInDate || isCheckOutDate ? 'font-bold' : ''}`}>{day}</span>
          {holiday && !isPast && (
            <span className={`text-[8px] ${isCheckInDate || isCheckOutDate ? 'text-white' : holiday.color} truncate w-full text-center`}>
              {holiday.name}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="flex-1">
        <div className="text-center font-semibold text-gray-800 dark:text-white mb-4">
          {monthDate.toLocaleString('default', { month: 'long' })} {monthDate.getFullYear()}
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="h-8 w-10 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 font-medium">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days}
        </div>
      </div>
    );
  };

  const handleSearch = () => {
    if (import.meta.env.DEV) {
      console.log('Searching with:', { location, checkIn, checkOut, rooms, adults, priceRange });
    }
    // Implement search functionality
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="bg-white dark:bg-black font-sans">
      {/* Header */}
      <Header1/>
      
            {/* Spacer for fixed header */}
            <div className="h-10 bg-white dark:bg-black"></div>
            
      <Header2/>
      
      <main >
        {/* Hero Section */}
        <section className="w-full">
        <video
          src="/video1.mp4" //add video link here..
          className="w-full h-[60vw] max-h-[600px] object-cover pt-2"
          autoPlay
          loop
          muted
          // controls
        >
          
        </video>
      </section>

        {/* Hotel Search Section */}
       

        {/* Tour Categories Section */}
        <section className="py-16 bg-white dark:bg-gray-900">
        <div className="container mx-auto px-4">
            <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800 dark:text-white">Explore Tour Types</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Find the perfect journey that fits your style.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {tourCategories.map(category => (
                <motion.div
                key={category.id}
                whileHover={{ y: -5 }}
                className="text-center p-6 border dark:border-gray-700 rounded-lg hover:shadow-xl dark:hover:shadow-gray-800/50 hover:border-rose-500 dark:hover:border-rose-500 transition-all duration-300 cursor-pointer bg-white dark:bg-gray-800"
                onClick={() => {
                    if (category.name === 'Group Tours') {
                    setIsGroupToursOpen(true);
                    }
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && category.name === 'Group Tours') {
                    setIsGroupToursOpen(true);
                    }
                }}
                >
                <div className="flex items-center justify-center h-16 w-16 mx-auto bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-600 dark:text-fuchsia-400 rounded-full mb-4">
                    {category.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{category.name}</h3>
                <p className="text-gray-600 dark:text-gray-400">{category.description}</p>
                </motion.div>
            ))}
            </div>
        </div>
        
        <GroupToursPopup 
            isOpen={isGroupToursOpen} 
            onClose={() => setIsGroupToursOpen(false)} 
        />
        </section>

        {/* Popular Tours Section */}
        <section className="py-16 bg-gray-50 dark:bg-gray-800">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800 dark:text-white">Our Most Popular Tours</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">Handpicked destinations by our travel experts.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {tourPackages.map(tour => (
                      <div key={tour.id} className="bg-white dark:bg-black rounded-lg shadow-lg dark:shadow-gray-900/50 overflow-hidden transform hover:-translate-y-2 transition-transform duration-300 group">
                          <div className="relative">
                              <img src={tour.image} alt={tour.name} className="w-full h-56 object-cover" loading="lazy" />
                              <div className="absolute top-4 left-4 bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full">{tour.duration}</div>
                          </div>
                          <div className="p-6">
                              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2 h-14">{tour.name}</h3>
                              <div className="flex justify-between items-center mb-4">
                                  <div className="flex items-center">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                          <span key={i} className={i < tour.rating ? 'text-yellow-400' : 'text-gray-300'}>{icons.star}</span>
                                      ))}
                                  </div>
                                  <span className="text-2xl font-bold text-fuchsia-600">{tour.price}</span>
                              </div>
                               <button className="w-full bg-fuchsia-600 text-white font-bold py-2 rounded-md hover:bg-fuchsia-700 transition duration-300 group-hover:bg-rose-500">View Details</button>
                          </div>
                      </div>
                    ))}
                </div>
            </div>
        </section>

         {/* Trending Group Holidays Section */}
        <section className="py-16 bg-white dark:bg-black">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800 dark:text-white">Trending Group Holidays</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">Discover iconic destinations across India and the world with our group tours!</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {trendingHolidays.map(holiday => (
                        <div key={holiday.id} className="relative rounded-lg overflow-hidden h-48 text-white group shadow-lg cursor-pointer">
                            <img src={holiday.image} alt={holiday.name} className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300" loading="lazy" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-3">
                                <h3 className="font-bold text-base md:text-lg whitespace-nowrap overflow-hidden text-ellipsis">{holiday.name}</h3>
                                <div className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 max-h-0 group-hover:max-h-20 overflow-hidden">
                                    <p>{holiday.tours} Tours</p>
                                    <p>{holiday.departures} Departures</p>
                                    <p>{holiday.guests} Guests</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-16 bg-fuchsia-50 dark:bg-gray-800">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-extrabold text-gray-800 dark:text-white">What Our Guests Say</h2>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">Stories from our happy and satisfied travelers.</p>
                </div>
                <div className="relative max-w-3xl mx-auto">
                    <div className="overflow-hidden">
                        <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
                            {testimonials.map(t => (
                                <div key={t.id} className="w-full flex-shrink-0 text-center px-8">
                                    <img src={t.avatar} alt={t.name} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-white dark:border-gray-700 shadow-lg" loading="lazy" />
                                    <p className="text-lg italic text-gray-700 dark:text-gray-300 mb-4">"{t.quote}"</p>
                                    <h4 className="font-bold text-fuchsia-600 dark:text-fuchsia-400">{t.name}</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t.location}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                     <button onClick={prevTestimonial} className="absolute top-1/2 -translate-y-1/2 left-0 -translate-x-1/2 bg-white dark:bg-gray-700 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200">
                        {icons.chevronLeft}
                    </button>
                    <button onClick={nextTestimonial} className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 bg-white dark:bg-gray-700 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200">
                        {icons.chevronRight}
                    </button>
                </div>
            </div>
        </section>
      </main>

      {/* Footer */}
      <Footer4Col/>
    </div>
  );
}

