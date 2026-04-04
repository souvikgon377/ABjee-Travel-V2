import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Header1 from '../mvpblocks/header-1';

interface RoomType {
    id: string;
    name: string;
    maxGuests: number;
    bedType: string;
    pricePerNight: number;
    quantity: number;
    amenities: string[];
}

interface HotelFormData {
    // Basic Info
    name: string;
    description: string;
    hotelType: string;
    starRating: number;
    
    // Location
    address: string;
    city: string;
    state: string;
    pincode: string;
    landmark: string;
    latitude: string;
    longitude: string;
    
    // Contact
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    website: string;
    
    // Amenities
    amenities: string[];
    
    // Rooms
    rooms: RoomType[];
    
    // Policies
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    petsAllowed: boolean;
    smokingAllowed: boolean;
    
    // Images
    images: string[];
}

const AddHotel: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    
    const [formData, setFormData] = useState<HotelFormData>({
        name: '',
        description: '',
        hotelType: '',
        starRating: 3,
        address: '',
        city: '',
        state: '',
        pincode: '',
        landmark: '',
        latitude: '',
        longitude: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        website: '',
        amenities: [],
        rooms: [],
        checkInTime: '14:00',
        checkOutTime: '11:00',
        cancellationPolicy: 'flexible',
        petsAllowed: false,
        smokingAllowed: false,
        images: [],
    });

    const [newRoom, setNewRoom] = useState<RoomType>({
        id: '',
        name: '',
        maxGuests: 2,
        bedType: 'double',
        pricePerNight: 0,
        quantity: 1,
        amenities: [],
    });

    const totalSteps = 5;

    const hotelTypes = [
        'Hotel', 'Resort', 'Guest House', 'Homestay', 'Villa', 
        'Apartment', 'Hostel', 'Boutique Hotel', 'Heritage Hotel', 'Budget Hotel'
    ];

    const allAmenities = [
        { id: 'wifi', label: 'Free WiFi', icon: '📶' },
        { id: 'parking', label: 'Free Parking', icon: '🅿️' },
        { id: 'pool', label: 'Swimming Pool', icon: '🏊' },
        { id: 'gym', label: 'Gym/Fitness Center', icon: '💪' },
        { id: 'spa', label: 'Spa & Wellness', icon: '🧖' },
        { id: 'restaurant', label: 'Restaurant', icon: '🍽️' },
        { id: 'bar', label: 'Bar/Lounge', icon: '🍸' },
        { id: 'roomservice', label: '24/7 Room Service', icon: '🛎️' },
        { id: 'ac', label: 'Air Conditioning', icon: '❄️' },
        { id: 'tv', label: 'Flat Screen TV', icon: '📺' },
        { id: 'laundry', label: 'Laundry Service', icon: '🧺' },
        { id: 'airport', label: 'Airport Shuttle', icon: '✈️' },
        { id: 'breakfast', label: 'Complimentary Breakfast', icon: '🍳' },
        { id: 'concierge', label: 'Concierge Service', icon: '🎩' },
        { id: 'businesscenter', label: 'Business Center', icon: '💼' },
        { id: 'conferenceroom', label: 'Conference Room', icon: '📊' },
        { id: 'garden', label: 'Garden', icon: '🌳' },
        { id: 'terrace', label: 'Rooftop Terrace', icon: '🌅' },
        { id: 'petfriendly', label: 'Pet Friendly', icon: '🐕' },
        { id: 'wheelchair', label: 'Wheelchair Accessible', icon: '♿' },
    ];

    const roomAmenities = [
        'Private Bathroom', 'Balcony', 'Mountain View', 'Sea View', 'City View',
        'Mini Bar', 'Safe', 'Desk', 'Wardrobe', 'Coffee Maker', 'Hairdryer',
        'Iron', 'Bathtub', 'Shower', 'Toiletries', 'Slippers', 'Bathrobe'
    ];

    const bedTypes = [
        { id: 'single', label: 'Single Bed' },
        { id: 'double', label: 'Double Bed' },
        { id: 'queen', label: 'Queen Bed' },
        { id: 'king', label: 'King Bed' },
        { id: 'twin', label: 'Twin Beds' },
        { id: 'bunk', label: 'Bunk Beds' },
    ];

    const indianStates = [
        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
        'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
        'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
        'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        'Delhi', 'Jammu & Kashmir', 'Ladakh'
    ];

    const updateFormData = (field: keyof HotelFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const toggleAmenity = (amenityId: string) => {
        setFormData(prev => ({
            ...prev,
            amenities: prev.amenities.includes(amenityId)
                ? prev.amenities.filter(a => a !== amenityId)
                : [...prev.amenities, amenityId]
        }));
    };

    const addRoom = () => {
        if (newRoom.name && newRoom.pricePerNight > 0) {
            const room = { ...newRoom, id: Date.now().toString() };
            setFormData(prev => ({ ...prev, rooms: [...prev.rooms, room] }));
            setNewRoom({
                id: '',
                name: '',
                maxGuests: 2,
                bedType: 'double',
                pricePerNight: 0,
                quantity: 1,
                amenities: [],
            });
        }
    };

    const removeRoom = (roomId: string) => {
        setFormData(prev => ({
            ...prev,
            rooms: prev.rooms.filter(r => r.id !== roomId)
        }));
    };

    const toggleRoomAmenity = (amenity: string) => {
        setNewRoom(prev => ({
            ...prev,
            amenities: prev.amenities.includes(amenity)
                ? prev.amenities.filter(a => a !== amenity)
                : [...prev.amenities, amenity]
        }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            // In real app, upload to server and get URLs
            // For demo, using placeholder URLs
            const newImages = Array.from(files).map((_, idx) => 
                `https://images.unsplash.com/photo-${1566073771259 + idx}-6a6bd5383b63?w=800`
            );
            setFormData(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
        }
    };

    const removeImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setIsSubmitting(false);
        setSubmitSuccess(true);
    };

    const nextStep = () => {
        if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
    };

    const prevStep = () => {
        if (currentStep > 1) setCurrentStep(prev => prev - 1);
    };

    const renderStarRating = () => (
        <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    onClick={() => updateFormData('starRating', star)}
                    className={`text-3xl transition-colors ${
                        star <= formData.starRating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'
                    }`}
                >
                    ★
                </button>
            ))}
            <span className="ml-2 text-gray-600 dark:text-gray-400">{formData.starRating} Star</span>
        </div>
    );

    const renderStep1 = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Basic Information</h2>
            
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Hotel/Property Name *
                </label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateFormData('name', e.target.value)}
                    placeholder="Enter your hotel name"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Property Type *
                </label>
                <select
                    value={formData.hotelType}
                    onChange={(e) => updateFormData('hotelType', e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    <option value="">Select property type</option>
                    {hotelTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Star Rating
                </label>
                {renderStarRating()}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description *
                </label>
                <textarea
                    value={formData.description}
                    onChange={(e) => updateFormData('description', e.target.value)}
                    placeholder="Describe your property, its unique features, nearby attractions..."
                    rows={5}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-sm text-gray-500 mt-1">{formData.description.length}/1000 characters</p>
            </div>
        </motion.div>
    );

    const renderStep2 = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Location & Contact</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Street Address *
                    </label>
                    <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => updateFormData('address', e.target.value)}
                        placeholder="Enter complete street address"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        City *
                    </label>
                    <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => updateFormData('city', e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        State *
                    </label>
                    <select
                        value={formData.state}
                        onChange={(e) => updateFormData('state', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">Select state</option>
                        {indianStates.map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Pincode *
                    </label>
                    <input
                        type="text"
                        value={formData.pincode}
                        onChange={(e) => updateFormData('pincode', e.target.value)}
                        placeholder="6-digit pincode"
                        maxLength={6}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nearby Landmark
                    </label>
                    <input
                        type="text"
                        value={formData.landmark}
                        onChange={(e) => updateFormData('landmark', e.target.value)}
                        placeholder="e.g., Near Railway Station"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Contact Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Contact Person Name *
                        </label>
                        <input
                            type="text"
                            value={formData.contactName}
                            onChange={(e) => updateFormData('contactName', e.target.value)}
                            placeholder="Full name"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Phone Number *
                        </label>
                        <input
                            type="tel"
                            value={formData.contactPhone}
                            onChange={(e) => updateFormData('contactPhone', e.target.value)}
                            placeholder="+91 XXXXX XXXXX"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            value={formData.contactEmail}
                            onChange={(e) => updateFormData('contactEmail', e.target.value)}
                            placeholder="hotel@example.com"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Website (Optional)
                        </label>
                        <input
                            type="url"
                            value={formData.website}
                            onChange={(e) => updateFormData('website', e.target.value)}
                            placeholder="https://www.yourhotel.com"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );

    const renderStep3 = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Amenities & Facilities</h2>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
                Select all amenities available at your property
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {allAmenities.map(amenity => (
                    <motion.button
                        key={amenity.id}
                        type="button"
                        onClick={() => toggleAmenity(amenity.id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                            formData.amenities.includes(amenity.id)
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        <span className="text-2xl block mb-2">{amenity.icon}</span>
                        <span className={`text-sm font-medium ${
                            formData.amenities.includes(amenity.id)
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-gray-700 dark:text-gray-300'
                        }`}>
                            {amenity.label}
                        </span>
                    </motion.button>
                ))}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mt-6">
                <p className="text-blue-800 dark:text-blue-200 text-sm">
                    <strong>Tip:</strong> Properties with more amenities listed get 40% more bookings on average.
                </p>
            </div>
        </motion.div>
    );

    const renderStep4 = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Room Types & Pricing</h2>
            
            {/* Existing Rooms */}
            {formData.rooms.length > 0 && (
                <div className="space-y-3 mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Added Rooms</h3>
                    {formData.rooms.map(room => (
                        <div
                            key={room.id}
                            className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                        >
                            <div>
                                <h4 className="font-semibold text-gray-800 dark:text-white">{room.name}</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {room.bedType} • {room.maxGuests} guests • {room.quantity} rooms
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xl font-bold text-green-600">₹{room.pricePerNight.toLocaleString()}</span>
                                <button
                                    type="button"
                                    onClick={() => removeRoom(room.id)}
                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add New Room */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Add New Room Type</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Room Name *
                        </label>
                        <input
                            type="text"
                            value={newRoom.name}
                            onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g., Deluxe Double Room"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Bed Type
                        </label>
                        <select
                            value={newRoom.bedType}
                            onChange={(e) => setNewRoom(prev => ({ ...prev, bedType: e.target.value }))}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {bedTypes.map(bed => (
                                <option key={bed.id} value={bed.id}>{bed.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Max Guests
                        </label>
                        <select
                            value={newRoom.maxGuests}
                            onChange={(e) => setNewRoom(prev => ({ ...prev, maxGuests: parseInt(e.target.value) }))}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            {[1, 2, 3, 4, 5, 6].map(num => (
                                <option key={num} value={num}>{num} {num === 1 ? 'Guest' : 'Guests'}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Number of Rooms
                        </label>
                        <input
                            type="number"
                            value={newRoom.quantity}
                            onChange={(e) => setNewRoom(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                            min={1}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Price Per Night (₹) *
                        </label>
                        <input
                            type="number"
                            value={newRoom.pricePerNight || ''}
                            onChange={(e) => setNewRoom(prev => ({ ...prev, pricePerNight: parseInt(e.target.value) || 0 }))}
                            placeholder="e.g., 2500"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Room Amenities
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {roomAmenities.map(amenity => (
                                <button
                                    key={amenity}
                                    type="button"
                                    onClick={() => toggleRoomAmenity(amenity)}
                                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                                        newRoom.amenities.includes(amenity)
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {amenity}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <motion.button
                    type="button"
                    onClick={addRoom}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!newRoom.name || newRoom.pricePerNight <= 0}
                    className="mt-4 w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
                >
                    + Add Room Type
                </motion.button>
            </div>

            {formData.rooms.length === 0 && (
                <p className="text-amber-600 dark:text-amber-400 text-sm">
                    ⚠️ Please add at least one room type to continue
                </p>
            )}
        </motion.div>
    );

    const renderStep5 = () => (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
        >
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Policies & Photos</h2>
            
            {/* Policies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Check-in Time
                    </label>
                    <input
                        type="time"
                        value={formData.checkInTime}
                        onChange={(e) => updateFormData('checkInTime', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Check-out Time
                    </label>
                    <input
                        type="time"
                        value={formData.checkOutTime}
                        onChange={(e) => updateFormData('checkOutTime', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Cancellation Policy
                    </label>
                    <select
                        value={formData.cancellationPolicy}
                        onChange={(e) => updateFormData('cancellationPolicy', e.target.value)}
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="flexible">Flexible - Free cancellation up to 24 hours before check-in</option>
                        <option value="moderate">Moderate - Free cancellation up to 5 days before check-in</option>
                        <option value="strict">Strict - 50% refund up to 1 week before check-in</option>
                        <option value="non-refundable">Non-refundable - No refund after booking</option>
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.petsAllowed}
                            onChange={(e) => updateFormData('petsAllowed', e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">Pets Allowed</span>
                    </label>
                </div>

                <div className="flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.smokingAllowed}
                            onChange={(e) => updateFormData('smokingAllowed', e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">Smoking Allowed</span>
                    </label>
                </div>
            </div>

            {/* Photo Upload */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Property Photos</h3>
                
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Drag & drop photos here or click to browse
                    </p>
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="photo-upload"
                    />
                    <label
                        htmlFor="photo-upload"
                        className="inline-block px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg cursor-pointer transition-colors"
                    >
                        Upload Photos
                    </label>
                    <p className="text-sm text-gray-500 mt-2">
                        Upload at least 5 photos. Supported formats: JPG, PNG (Max 5MB each)
                    </p>
                </div>

                {/* Image Preview */}
                {formData.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        {formData.images.map((img, idx) => (
                            <div key={idx} className="relative group">
                                <img
                                    src={img}
                                    alt={`Property ${idx + 1}`}
                                    className="w-full h-32 object-cover rounded-lg"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                                {idx === 0 && (
                                    <span className="absolute bottom-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                                        Cover Photo
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );

    const renderSuccessScreen = () => (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
        >
            <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4">
                Property Submitted Successfully!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Thank you for listing your property with us. Our team will review your submission and get back to you within 24-48 hours.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 max-w-md mx-auto mb-8">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">What happens next?</h3>
                <ul className="text-left text-sm text-blue-700 dark:text-blue-300 space-y-2">
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">1.</span>
                        Our team reviews your property details
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">2.</span>
                        We may contact you for additional information
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-blue-500">3.</span>
                        Once approved, your property goes live!
                    </li>
                </ul>
            </div>
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => window.location.href = '/'}
                    className="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg"
            >
                Back to Home
            </motion.button>
        </motion.div>
    );

    if (submitSuccess) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
                <Header1 />
                <div className="h-20"></div>
                <div className="max-w-4xl mx-auto px-4 py-8">
                    {renderSuccessScreen()}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <Header1 />
            <div className="h-20 bg-white dark:bg-black"></div>

            {/* Hero Section */}
            <div className="bg-linear-to-r from-blue-600 to-indigo-700 text-white py-12">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h1 className="text-3xl md:text-4xl font-bold mb-4">List Your Property</h1>
                    <p className="text-blue-100 text-lg">
                        Join thousands of property owners earning with ABjee Travel
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-20 z-40">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-2">
                        {['Basic Info', 'Location', 'Amenities', 'Rooms', 'Policies'].map((step, idx) => (
                            <div
                                key={step}
                                className={`flex items-center ${idx < 4 ? 'flex-1' : ''}`}
                            >
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                                    idx + 1 < currentStep
                                        ? 'bg-green-500 text-white'
                                        : idx + 1 === currentStep
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                }`}>
                                    {idx + 1 < currentStep ? '✓' : idx + 1}
                                </div>
                                <span className={`ml-2 text-sm hidden md:block ${
                                    idx + 1 === currentStep
                                        ? 'text-blue-600 dark:text-blue-400 font-semibold'
                                        : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                    {step}
                                </span>
                                {idx < 4 && (
                                    <div className={`flex-1 h-1 mx-4 rounded ${
                                        idx + 1 < currentStep
                                            ? 'bg-green-500'
                                            : 'bg-gray-200 dark:bg-gray-700'
                                    }`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Form Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8">
                    <AnimatePresence mode="wait">
                        {currentStep === 1 && renderStep1()}
                        {currentStep === 2 && renderStep2()}
                        {currentStep === 3 && renderStep3()}
                        {currentStep === 4 && renderStep4()}
                        {currentStep === 5 && renderStep5()}
                    </AnimatePresence>

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <motion.button
                            type="button"
                            onClick={prevStep}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            disabled={currentStep === 1}
                            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                                currentStep === 1
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            ← Previous
                        </motion.button>

                        {currentStep < totalSteps ? (
                            <motion.button
                                type="button"
                                onClick={nextStep}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg shadow-md"
                            >
                                Next Step →
                            </motion.button>
                        ) : (
                            <motion.button
                                type="button"
                                onClick={handleSubmit}
                                disabled={isSubmitting || formData.rooms.length === 0}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="px-8 py-3 bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-lg shadow-md flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                            className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                                        />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit Property'
                                )}
                            </motion.button>
                        )}
                    </div>
                </div>

                {/* Help Section */}
                <div className="mt-8 bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-2xl">💡</span>
                        </div>
                        <div>
                            <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Need Help?</h3>
                            <p className="text-amber-700 dark:text-amber-300 text-sm">
                                Our support team is available 24/7 to help you list your property. 
                                Call us at <strong>1800-XXX-XXXX</strong> or email <strong>partners@abjeetravel.com</strong>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddHotel;
