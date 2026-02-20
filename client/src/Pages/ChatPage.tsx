import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { Plus, MessageCircle, Users, Clock, Share2, Trash2, Copy, Lock, Sparkles, Crown, Shield, Compass, Eye, Calendar, Search, PauseCircle, PlayCircle, X, ChevronLeft, ChevronRight, Star, Upload, Image as ImageIcon, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { chatService } from '@/lib/chatService';
import { type ChatRoom as ChatRoomType } from '@/lib/chatService';
import { uploadImageToCloudinary, createImagePreview, revokeImagePreview, type ImageUploadResult } from '@/lib/imageUpload';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Header from '@/components/mvpblocks/header-1';
import ChatRoom from '@/components/chat/ChatRoom';

// Constants - moved outside component for performance
const COUNTRIES = ['India', 'USA', 'Canada', 'Switzerland', 'Nepal', 'Australia', 'Norway', 'Iceland', 'New Zealand', 'Chile'] as const;

const TIRUMALA_TEMPLE_IMAGES = [
  '/tirumala-temple_tirupati_1.jpg',
  '/tirumala-temple_tirupati_2.jpg',
  '/tirumala-temple_tirupati_3.jpg'
] as const;

const IMAGE_SHUFFLE_INTERVAL = 3000;

// India tourist data
const INDIA_DATA: { [key: string]: string[] } = {
  'Andhra Pradesh': ['Tirupati', 'Visakhapatnam', 'Araku Valley', 'Borra Caves'],
  'Arunachal Pradesh': ['Tawang', 'Ziro Valley', 'Bomdila', 'Namdapha National Park'],
  'Assam': ['Kaziranga National Park', 'Kamakhya Temple', 'Majuli Island', 'Sivasagar'],
  'Bihar': ['Bodh Gaya', 'Nalanda', 'Rajgir', 'Patna'],
  'Chhattisgarh': ['Chitrakote Falls', 'Tirathgarh Falls', 'Kanger Valley National Park'],
  'Goa': ['Calangute Beach', 'Baga Beach', 'Dudhsagar Falls', 'Old Goa Churches'],
  'Gujarat': ['Gir National Park', 'Rann of Kutch', 'Somnath Temple', 'Dwarka'],
  'Haryana': ['Kurukshetra', 'Sultanpur Bird Sanctuary', 'Morni Hills'],
  'Himachal Pradesh': ['Manali', 'Shimla', 'Dharamshala', 'Spiti Valley', 'Kullu', 'Kasol', 'Dalhousie'],
  'Jharkhand': ['Hundru Falls', 'Betla National Park', 'Ranchi Hill', 'Tagore Hill'],
  'Karnataka': ['Coorg', 'Hampi', 'Mysore Palace', 'Gokarna', 'Chikmagalur', 'Jog Falls'],
  'Kerala': ['Munnar', 'Alleppey Backwaters', 'Wayanad', 'Thekkady', 'Kovalam', 'Varkala'],
  'Madhya Pradesh': ['Khajuraho', 'Kanha National Park', 'Pachmarhi', 'Bandhavgarh'],
  'Maharashtra': ['Lonavala', 'Mahabaleshwar', 'Ajanta Caves', 'Ellora Caves', 'Matheran'],
  'Manipur': ['Loktak Lake', 'Kangla Fort', 'Keibul Lamjao National Park'],
  'Meghalaya': ['Cherrapunji', 'Shillong', 'Living Root Bridges', 'Dawki'],
  'Mizoram': ['Aizawl', 'Champhai', 'Phawngpui Peak'],
  'Nagaland': ['Kohima', 'Dzukou Valley', 'Hornbill Festival'],
  'Odisha': ['Puri', 'Konark Sun Temple', 'Chilika Lake', 'Simlipal National Park'],
  'Punjab': ['Golden Temple Amritsar', 'Wagah Border', 'Jallianwala Bagh'],
  'Rajasthan': ['Jaipur', 'Udaipur', 'Jaisalmer', 'Jodhpur', 'Mount Abu', 'Pushkar'],
  'Sikkim': ['Gangtok', 'Nathula Pass', 'Tsomgo Lake', 'Pelling', 'Yumthang Valley'],
  'Tamil Nadu': ['Ooty', 'Kodaikanal', 'Mahabalipuram', 'Rameswaram', 'Kanyakumari'],
  'Telangana': ['Hyderabad', 'Warangal Fort', 'Ramoji Film City'],
  'Tripura': ['Ujjayanta Palace', 'Neermahal', 'Sepahijala Wildlife Sanctuary'],
  'Uttar Pradesh': ['Taj Mahal Agra', 'Varanasi', 'Nainital', 'Mussoorie', 'Rishikesh'],
  'Uttarakhand': ['Valley of Flowers', 'Kedarnath', 'Badrinath', 'Jim Corbett', 'Auli', 'Haridwar'],
  'West Bengal': ['Darjeeling', 'Sundarbans', 'Kalimpong', 'Sandakphu'],
  'Ladakh': ['Pangong Lake', 'Nubra Valley', 'Leh Palace', 'Magnetic Hill', 'Tso Moriri'],
  'Jammu & Kashmir': ['Gulmarg', 'Pahalgam', 'Sonamarg', 'Dal Lake', 'Vaishno Devi'],
};

type AttractionData = {
  name: string;
  description: string;
  icon: string;
  images?: readonly string[];
};

const ATTRACTIONS_DATA: { [key: string]: AttractionData[] } = {
  'Tirupati': [
    { 
      name: 'Tirumala Venkateswara Temple', 
      description: 'Sacred temple dedicated to Lord Venkateswara', 
      icon: '🛕',
      images: TIRUMALA_TEMPLE_IMAGES
    },
    { name: 'Sri Govindaraja Swamy Temple', description: 'Ancient Vishnu temple in the heart of Tirupati', icon: '🕉️' },
    { name: 'Sri Padmavathi Ammavari Temple', description: 'Beautiful temple dedicated to Goddess Padmavathi', icon: '🪷' },
    { name: 'Silathoranam', description: 'Natural rock formation, geological wonder', icon: '🏔️' },
    { name: 'Talakona Waterfall', description: 'Highest waterfall in Andhra Pradesh', icon: '💧' },
    { name: 'Chandragiri Fort', description: 'Historic fort with panoramic views', icon: '🏰' },
  ],
  'Manali': [
    { name: 'Rohtang Pass', description: 'High mountain pass with stunning snow views', icon: '🏔️' },
    { name: 'Solang Valley', description: 'Adventure sports and scenic beauty', icon: '🎿' },
    { name: 'Hadimba Temple', description: 'Ancient cave temple surrounded by cedar forest', icon: '🛕' },
    { name: 'Old Manali', description: 'Charming village with cafes and markets', icon: '🏘️' },
    { name: 'Beas River', description: 'River rafting and riverside camping', icon: '🏞️' },
    { name: 'Vashisht Hot Springs', description: 'Natural hot water springs and temples', icon: '♨️' },
  ],
  'Shimla': [
    { name: 'The Mall Road', description: 'Popular shopping and dining street', icon: '🛍️' },
    { name: 'Jakhu Temple', description: 'Hilltop Hanuman temple with city views', icon: '🛕' },
    { name: 'The Ridge', description: 'Open space with panoramic mountain views', icon: '🏔️' },
    { name: 'Kufri', description: 'Hill station known for skiing and adventure', icon: '⛷️' },
    { name: 'Christ Church', description: 'Historic neo-Gothic church', icon: '⛪' },
    { name: 'Viceregal Lodge', description: 'British-era architectural marvel', icon: '🏛️' },
  ],
  'Munnar': [
    { name: 'Tea Gardens', description: 'Sprawling tea plantations with scenic views', icon: '🍵' },
    { name: 'Eravikulam National Park', description: 'Home to endangered Nilgiri Tahr', icon: '🦌' },
    { name: 'Mattupetty Dam', description: 'Beautiful dam surrounded by hills', icon: '🌊' },
    { name: 'Top Station', description: 'Highest point with breathtaking views', icon: '🏔️' },
    { name: 'Echo Point', description: 'Natural echo phenomenon spot', icon: '📢' },
    { name: 'Attukal Waterfalls', description: 'Cascading waterfall in lush greenery', icon: '💧' },
  ],
  'Jaipur': [
    { name: 'Hawa Mahal', description: 'Iconic palace with 953 windows', icon: '🏛️' },
    { name: 'Amber Fort', description: 'Majestic fort with stunning architecture', icon: '🏰' },
    { name: 'City Palace', description: 'Royal residence with museums', icon: '👑' },
    { name: 'Jantar Mantar', description: 'Astronomical observatory UNESCO site', icon: '🔭' },
    { name: 'Nahargarh Fort', description: 'Fort offering panoramic city views', icon: '🏯' },
    { name: 'Jal Mahal', description: 'Palace in the middle of Man Sagar Lake', icon: '🏰' },
  ],
};

type TempleDetail = {
  title: string;
  subtitle: string;
  description: string;
  legend: string;
  history: string;
  significance: string;
  architecture: {
    overview: string;
    features: string[];
  };
  deity: {
    description: string;
    features: string[];
  };
  festivals: {
    name: string;
    description: string;
  }[];
  sevenHills: {
    name: string;
    description: string;
  }[];
  features: string[];
  images: readonly string[];
  visitingInfo: {
    timings: string;
    entryFee: string;
    dresscode: string;
    bestTimeToVisit: string;
    dailyVisitors: string;
    specialDays: string;
  };
  religiousSignificance: string[];
};

const TEMPLE_DETAILS: { [key: string]: TempleDetail } = {
  'Tirumala Venkateswara Temple': {
    title: 'Sri Venkateswara Swami Temple',
    subtitle: 'Temple of Seven Hills • Kaliyuga Vaikuntha • One of the Richest Temples in the World',
    description: 'The Venkateswara Temple of Tirumala is a Hindu temple situated in the hills of Tirumala at Tirupati in Andhra Pradesh, India. Dedicated to Lord Venkateswara, a form of Vishnu, who appeared on earth to save mankind from trials and troubles of Kali Yuga. Also known as Kaliyuga Vaikuntha, the temple attracts over 24 million devotees annually, making it one of the most visited religious sites in the world.',
    legend: 'During Kali Yuga, sage Bhrigu kicked Lord Vishnu in the chest while testing the Trinity. Goddess Lakshmi, finding this an insult, left Vaikuntha and came to Earth. Vishnu took human form as Srinivasa and searched for her, reaching Tirumala hills. He married Padmavati (reincarnation of Lakshmi) after borrowing 1.14 crore gold coins from Kubera. The Lord chose to remain on the seven hills for the emancipation of mankind, and both deities turned into stone expressing their wish to be there eternally.',
    history: 'The temple was built by Thondaman king and reformed by Cholas, Pandyas and Vijayanagara Empire. Construction started from 300 CE in Dravidian architecture. The temple gained immense wealth under Vijayanagara Empire (14th-15th centuries). Emperor Krishnadevaraya donated gold and jewels, enabling the Ananda Nilayam roofing to be gilded. Ramanujacharya (11th century) streamlined rituals according to Vaikhanasa Agama tradition. The temple is mentioned in ancient texts including Cilappatikaram. Currently managed by Tirumala Tirupati Devasthanams (TTD) under Andhra Pradesh Government.',
    significance: 'The temple is one of eight Vishnu Swayambhu (self-manifested) Kshetras and listed as the 75th Divya Desam among 108 temples in Naalayira Divya Prabandham. It is revered as "Nitya-daiva-kalpa" — the eternal deity which shall remain on Venkatachala until the end of present Kalpa. The temple observes 433 festivals in 365 days, earning the title "Nitya Kalyanam Paccha Toranam" (every day is a festival).',
    architecture: {
      overview: 'Built in Dravidian style over 300 CE, the temple sits at 853 metres (2,799 ft) above sea level on Venkatadri, the seventh peak of Seshachalam Hills. The complex covers 26.75 km² with three entrances (Mahadvaram, Vendivakili, Bangaruvakili) leading to the Garbhagriha called Ananda Nilayam.',
      features: [
        'Mahadvaram (Main Entrance) - 50 feet, five-storied Gopuram with seven kalasams',
        'Ananda Nilayam Vimanam - Three-storied gopuram covered with gilt copper plates and golden vase',
        'Garbhagriha (Sanctum) - Houses the deity in standing posture facing east with four hands',
        'Vimana Venkateswara - Exact replica of main deity carved on the gopuram',
        'Golden Entrance (Bangaruvakili) - Wooden doors covered with gold plates depicting Dashavatara',
        'Swami Pushkarini - Holy water tank on whose banks the temple stands'
      ]
    },
    deity: {
      description: 'Lord Venkateswara stands in sanctum with four hands - one in varada (blessing) posture, one on thigh, and two holding Panchajanya (conch) and Sudarshana Chakra (discus). The deity bears Goddess Lakshmi on the right chest and Goddess Padmavati on the left, adorned with precious ornaments including Vajra Kiritam (diamond crown).',
      features: [
        'Pancha Berams - Five deity forms: Dhruva (Moolavirat), Kautuka, Snapana, Malayappa (Utsava), and Bali',
        'Bhoga Srinivasa - Silver deity receiving daily sevas and SahasraKalasabhisheka on Wednesdays',
        'Ugra Srinivasa - Fearsome aspect, processes once yearly on Kaishika Dwadasi before sunrise',
        'Malayappa Swami - Processional deity flanked by Sridevi and Bhudevi for all festivals',
        'Koluvu Srinivasa - Guardian deity presiding over temple\'s financial affairs'
      ]
    },
    festivals: [
      {
        name: 'Sri Venkateswara Brahmotsavams',
        description: 'Nine-day annual festival in October with lakhs of devotees. Malayappa deity processes on various vahanas including Garuda, Golden Chariot, and Elephant.'
      },
      {
        name: 'Vaikunta Ekadasi',
        description: 'Most important Vaishnava festival when Vaikunta Dwaram (heaven\'s gate) opens. Up to 150,000 devotees have darshan through the special entrance encircling inner sanctum.'
      },
      {
        name: 'Rathasapthami',
        description: 'February festival where Malayappa processes on seven different vahanas from early morning to late night, celebrating the sun god.'
      },
      {
        name: 'Other Festivals',
        description: 'Rama Navami, Janmashtami, Ugadi, Teppotsavam (Float Festival), Vasanthotsavam (Spring Festival), Padmavati Parinayotsavams celebrated with grandeur.'
      }
    ],
    sevenHills: [
      { name: 'Venkatadri', description: 'Hill of Venkateswara - The seventh peak where the main temple stands' },
      { name: 'Seshadri (Seshachalam)', description: 'Hill of Adisesha - The divine serpent, dasa of Vishnu' },
      { name: 'Garudadri (Garudachalam)', description: 'Hill of Garuda - The vahana (vehicle) of Lord Vishnu' },
      { name: 'Anjanadri', description: 'Hill of Hanuman - The devoted monkey god' },
      { name: 'Vrushabhadri', description: 'Hill of Vrishabasura - Demon killed by Srinivasa' },
      { name: 'Neeladri', description: 'Hill of Neela Devi - Gandharva princess who offered her hair' },
      { name: 'Narayanadri', description: 'Hill of Narayana - Where Srivari Padalu (footprints) are located' }
    ],
    features: [
      'World\'s most visited temple - 24 million annual visitors, 60,000+ daily pilgrims',
      'Richest temple - Daily hundi collections up to ₹22.5 million, annual income ₹10,000+ million',
      'Hair tonsuring tradition - Over 1 ton of hair collected daily as offering',
      'Free meals - Tarigonda Vengamamba Annaprasadam complex serves thousands daily',
      'Tirupati Laddu - Famous prasadam with Geographical Indication tag',
      'Vaikuntam Queue Complexes - Modern facilities to manage massive pilgrim crowds',
      '640 ancient inscriptions in Kannada, Sanskrit, Tamil, Telugu languages',
      '3000 copper plates with Annamacharya\'s 32,000 Telugu sankirtanas',
      'Vaikhanasa Agama worship - Six daily pujas as per ancient tradition',
      'TTD administration - One of the wealthiest religious organizations globally'
    ],
    images: TIRUMALA_TEMPLE_IMAGES,
    visitingInfo: {
      timings: 'Open 24/7 - Suprabhatam Seva at 3 AM, Main Darshan from 2:30 AM to 1:00 AM (next day)',
      entryFee: 'Sarva Darshan (Free), Special Entry Darshan (₹300), Divya Darshan, other paid services available',
      dresscode: 'Traditional attire required - Men: Dhoti/Pyjama, Women: Saree/Salwar, Western wear not permitted',
      bestTimeToVisit: 'September to February (pleasant weather). Peak rush during festivals like Brahmotsavams and Vaikunta Ekadasi',
      dailyVisitors: 'Average 60,000-87,000 pilgrims daily. Up to 150,000+ on special occasions and festivals',
      specialDays: 'Vaikunta Ekadasi, Brahmotsavams (9 days), Rathasapthami, Ugadi, Rama Navami, Janmashtami'
    },
    religiousSignificance: [
      'One of eight Vishnu Swayambhu (self-manifested) Kshetras where deity appeared on its own',
      '75th Divya Desam among 108 sacred Vishnu temples in Naalayira Divya Prabandham',
      'Saptagiri (Seven Hills) represent seven hoods of Adisesha, the divine serpent',
      'Revered by Alvars in Divya Prabandham as supreme pilgrimage destination',
      'Mentioned in Rig Veda and Asthadasa Puranas as great bestower of boons',
      'Eternal deity (Nitya-daiva-kalpa) to remain until end of present Kalpa',
      'Ramanujacharya established worship rituals and Tirupati Jeeyar Mutt (1119 AD)',
      'Tallapaka Annamacharya composed 32,000 devotional songs praising the deity'
    ]
  }
};

/**
 * Chat Rooms List Component
 */
const ChatRoomsList: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [rooms, setRooms] = useState<ChatRoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Image upload states
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string>('');
  const [iconImageFile, setIconImageFile] = useState<File | null>(null);
  const [iconImagePreview, setIconImagePreview] = useState<string>('');
  const [uploadingImages, setUploadingImages] = useState(false);
  
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareRoom, setShareRoom] = useState<ChatRoomType | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [userCreatedRoomsCount, setUserCreatedRoomsCount] = useState(0);
  const [showExploreCategories, setShowExploreCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchDestination, setSearchDestination] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [currentTempleImageIndex, setCurrentTempleImageIndex] = useState(0);
  const [selectedAttraction, setSelectedAttraction] = useState<string | null>(null);
  const [gallerySlideIndex, setGallerySlideIndex] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState<string[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const templeDetailsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const communityRoomsRef = useRef<HTMLDivElement>(null);

  // Auto-slide gallery images
  useEffect(() => {
    if (!selectedAttraction || !TEMPLE_DETAILS[selectedAttraction]) return;
    
    const galleryInterval = setInterval(() => {
      setGallerySlideIndex((prevIndex) => {
        const totalImages = TEMPLE_DETAILS[selectedAttraction].images.length;
        return (prevIndex + 1) % totalImages;
      });
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(galleryInterval);
  }, [selectedAttraction]);

  // Auto-shuffle temple images
  useEffect(() => {
    if (searchDestination === 'Tirupati') {
      const interval = setInterval(() => {
        setCurrentTempleImageIndex((prev) => (prev + 1) % TIRUMALA_TEMPLE_IMAGES.length);
      }, IMAGE_SHUFFLE_INTERVAL);
      
      return () => clearInterval(interval);
    }
  }, [searchDestination]);

  // Memoized computed values for performance
  const availableStates = useMemo(() => {
    if (selectedCountry === 'India') {
      return Object.keys(INDIA_DATA);
    }
    return [];
  }, [selectedCountry]);

  const touristPlaces = useMemo(() => {
    if (selectedCountry === 'India' && selectedState) {
      return INDIA_DATA[selectedState] || [];
    }
    return [];
  }, [selectedCountry, selectedState]);

  const attractions = useMemo(() => {
    return ATTRACTIONS_DATA[searchDestination] || [];
  }, [searchDestination]);

  // Memoized event handlers
  const toggleVideoPlayback = useCallback(() => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play();
        setIsVideoPlaying(true);
      }
    }
  }, [isVideoPlaying]);

  const handleAttractionClick = useCallback((attractionName: string, hasImages: boolean) => {
    if (hasImages) {
      setSelectedAttraction(attractionName);
      setGallerySlideIndex(0); // Reset gallery to first image
      
      // Scroll to temple details after a short delay to allow rendering
      setTimeout(() => {
        templeDetailsRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, []);

  const scrollToCommunityRooms = useCallback(() => {
    setTimeout(() => {
      communityRoomsRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 100);
  }, []);

  const closeAttractionDetails = useCallback(() => {
    setSelectedAttraction(null);
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + reviewImages.length > 5) {
      alert('You can upload maximum 5 images');
      return;
    }
    
    setReviewImages(prev => [...prev, ...files]);
    
    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setReviewImagePreviews(prev => [...prev, ...newPreviews]);
  }, [reviewImages.length]);

  const removeReviewImage = useCallback((index: number) => {
    setReviewImages(prev => prev.filter((_, i) => i !== index));
    setReviewImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]); // Clean up memory
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSubmitReview = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reviewText.trim()) {
      alert('Please write your review');
      return;
    }

    // TODO: Implement backend API call to save review
    // const reviewData = {
    //   rating: reviewRating,
    //   text: reviewText,
    //   images: reviewImages,
    //   attraction: selectedAttraction,
    //   timestamp: Date.now()
    // };

    // Clean up image previews
    reviewImagePreviews.forEach(url => URL.revokeObjectURL(url));
    
    // Reset form
    setReviewText('');
    setReviewRating(5);
    setReviewImages([]);
    setReviewImagePreviews([]);
    
    alert('✨ Thank you for your review! It will be published after moderation.');
  }, [reviewText, reviewRating, reviewImages, reviewImagePreviews, selectedAttraction]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowCountryDropdown(false);
        setShowStateDropdown(false);
        setShowPlaceDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load chat rooms
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const unsubscribe = chatService.listenToUserRooms((loadedRooms: ChatRoomType[]) => {
        setRooms(loadedRooms);
        
        // Count rooms created by current user
        const count = loadedRooms.filter(room => room.createdBy === user.uid).length;
        setUserCreatedRoomsCount(count);
        
        setLoading(false);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading chat rooms:', error);
      }
      setLoading(false);
    }
  }, [user]);

  // Handle background image selection
  const handleBackgroundImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous preview if exists
      if (backgroundImagePreview) {
        revokeImagePreview(backgroundImagePreview);
      }
      setBackgroundImageFile(file);
      setBackgroundImagePreview(createImagePreview(file));
    }
  }, [backgroundImagePreview]);

  // Handle icon image selection
  const handleIconImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous preview if exists
      if (iconImagePreview) {
        revokeImagePreview(iconImagePreview);
      }
      setIconImageFile(file);
      setIconImagePreview(createImagePreview(file));
    }
  }, [iconImagePreview]);

  // Remove background image
  const removeBackgroundImage = useCallback(() => {
    if (backgroundImagePreview) {
      revokeImagePreview(backgroundImagePreview);
    }
    setBackgroundImageFile(null);
    setBackgroundImagePreview('');
  }, [backgroundImagePreview]);

  // Remove icon image
  const removeIconImage = useCallback(() => {
    if (iconImagePreview) {
      revokeImagePreview(iconImagePreview);
    }
    setIconImageFile(null);
    setIconImagePreview('');
  }, [iconImagePreview]);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      if (backgroundImagePreview) revokeImagePreview(backgroundImagePreview);
      if (iconImagePreview) revokeImagePreview(iconImagePreview);
    };
  }, [backgroundImagePreview, iconImagePreview]);

  // Create new room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newRoomName.trim() || !newRoomPassword.trim() || !user) return;

    setCreating(true);
    setUploadingImages(true);
    
    try {
      let backgroundImageData: ImageUploadResult | undefined;
      let iconImageData: ImageUploadResult | undefined;

      // Upload background image if selected
      if (backgroundImageFile) {
        try {
          backgroundImageData = await uploadImageToCloudinary(backgroundImageFile, {
            folder: 'chat-rooms/backgrounds'
          });
        } catch (error: any) {
          throw new Error(`Background image upload failed: ${error.message}`);
        }
      }

      // Upload icon image if selected
      if (iconImageFile) {
        try {
          iconImageData = await uploadImageToCloudinary(iconImageFile, {
            folder: 'chat-rooms/icons'
          });
        } catch (error: any) {
          throw new Error(`Icon image upload failed: ${error.message}`);
        }
      }

      setUploadingImages(false);

      // Create room with image metadata
      const roomId = await chatService.createGroupRoom(
        newRoomName.trim(),
        newRoomDescription.trim() || 'No description',
        newRoomPassword.trim(),
        [user.uid],
        backgroundImageData,
        iconImageData
      );

      // Reset form
      setShowCreateDialog(false);
      setNewRoomName('');
      setNewRoomDescription('');
      setNewRoomPassword('');
      removeBackgroundImage();
      removeIconImage();
      
      // Navigate to the new room
      navigate(`/chat/room/${roomId}`);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Error creating room:', error);
      }
      alert(error.message || 'Failed to create room');
      setUploadingImages(false);
    } finally {
      setCreating(false);
    }
  };

  // Handle share room
  const handleShareRoom = (room: ChatRoomType, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareRoom(room);
    setShowShareDialog(true);
    setCopiedInvite(false);
    setCopiedPassword(false);
  };

  // Copy invite link
  const copyInviteLink = () => {
    if (!shareRoom || !shareRoom.id || !shareRoom.inviteToken) return;
    
    const inviteLink = chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken);
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // Copy room credentials
  const copyCredentials = () => {
    if (!shareRoom || !shareRoom.id) return;
    
    const credentials = `Room ID: ${shareRoom.id}\nPassword: ${shareRoom.password || 'N/A'}`;
    navigator.clipboard.writeText(credentials);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  // Delete room
  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
      return;
    }

    try {
      await chatService.deleteRoom(roomId);
    } catch (error: any) {
      alert(error.message || 'Failed to delete room');
    }
  };

  // Format timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/30 border-t-primary mx-auto"></div>
            <Sparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <p className="mt-6 text-lg font-medium bg-gradient-to-r from-rose-600 to-pink-500 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
            Loading chat rooms...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Inspirational Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-rose-600 to-pink-500 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
            How do you like to spend your time...?
          </h2>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-12 py-4"
        >
          {/* Mobile Layout: Single column with explore section after first card */}
          <div className="md:hidden space-y-6">
            {/* Card 1: Explore Your Interest */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
              onClick={() => setShowExploreCategories(!showExploreCategories)}
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                {/* Video Background */}
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/v1.mp4" type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 via-cyan-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Compass className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">
                      Explore Your Interest
                    </h3>
                    <p className="text-white/90 text-base drop-shadow-md">
                      Discover communities that match your passions and travel style
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Explore by Category Section - Mobile Only */}
            <AnimatePresence>
              {showExploreCategories && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="space-y-6">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      Explore by category
                    </h2>
                    
                    <div className="space-y-4">
                      {/* Outdoors Card */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        whileHover={{ scale: 1.03 }}
                        className="group cursor-pointer"
                        onClick={() => setSelectedCategory('outdoors')}
                      >
                        <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                          <img 
                            src="/img6.jpg" 
                            alt="Outdoors"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-6">
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                              Outdoors
                            </h3>
                          </div>
                        </div>
                      </motion.div>

                      {/* Food Card */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        whileHover={{ scale: 1.03 }}
                        className="group cursor-pointer"
                      >
                        <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                          <img 
                            src="/img7.jpg" 
                            alt="Food"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-6">
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                              Food
                            </h3>
                          </div>
                        </div>
                      </motion.div>

                      {/* Culture Card */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.03 }}
                        className="group cursor-pointer"
                      >
                        <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                          <img 
                            src="/img8.jpg" 
                            alt="Culture"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-6">
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                              Culture
                            </h3>
                          </div>
                        </div>
                      </motion.div>

                      {/* Water Card */}
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        whileHover={{ scale: 1.03 }}
                        className="group cursor-pointer"
                      >
                        <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                          <img 
                            src="/img9.jpg" 
                            alt="Water"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-6">
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                              Water
                            </h3>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Card 2: Communicate with fellow travellers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.08, y: -8, rotateY: 2 }}
              onClick={scrollToCommunityRooms}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-rose-400 via-pink-400 to-red-400 p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(236,72,153,0.5)] transition-all duration-500">
                {/* Video Background */}
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/v2.mp4" type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-br from-rose-900/60 via-pink-900/50 to-red-900/60" />
                <div className="absolute inset-0 bg-gradient-to-br from-rose-400/30 via-pink-400/20 to-red-400/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.15, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.5 }}
                    className="w-16 h-16 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:bg-white/35 transition-colors duration-300"
                  >
                    <Users className="h-9 w-9 text-white drop-shadow-lg" />
                  </motion.div>
                  <div>
                    <motion.h3 
                      className="text-2xl font-bold text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Communicate with Fellow Travellers
                    </motion.h3>
                    <p className="text-white/95 text-base drop-shadow-lg font-medium">
                      Connect and share experiences with travelers worldwide 🌍✨
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Visualize your destination */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Eye className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      Visualize Your Destination
                    </h3>
                    <p className="text-white/90 text-base">
                      Get inspired by photos and stories from real travelers
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Make a perfect plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-green-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Calendar className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      Make a Perfect Plan
                    </h3>
                    <p className="text-white/90 text-base">
                      Collaborate with others to create unforgettable journeys
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Desktop/Tablet Layout: Grid with explore section below */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card 1: Explore Your Interest */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
              onClick={() => setShowExploreCategories(!showExploreCategories)}
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 p-6 shadow-xl hover:shadow-2xl transition-all duration-300">
                {/* Video Background */}
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/v1.mp4" type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 via-cyan-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Compass className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">
                      Explore Your Interest
                    </h3>
                    <p className="text-white/90 text-base drop-shadow-md">
                      Discover communities that match your passions and travel style
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Communicate with fellow travellers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.08, y: -8, rotateY: 2 }}
              onClick={scrollToCommunityRooms}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-rose-400 via-pink-400 to-red-400 p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(236,72,153,0.5)] transition-all duration-500">
                {/* Video Background */}
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/v2.mp4" type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-br from-rose-900/60 via-pink-900/50 to-red-900/60" />
                <div className="absolute inset-0 bg-gradient-to-br from-rose-400/30 via-pink-400/20 to-red-400/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.15, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.5 }}
                    className="w-16 h-16 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:bg-white/35 transition-colors duration-300"
                  >
                    <Users className="h-9 w-9 text-white drop-shadow-lg" />
                  </motion.div>
                  <div>
                    <motion.h3 
                      className="text-2xl font-bold text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Communicate with Fellow Travellers
                    </motion.h3>
                    <p className="text-white/95 text-base drop-shadow-lg font-medium">
                      Connect and share experiences with travelers worldwide 🌍✨
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Visualize your destination */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Eye className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      Visualize Your Destination
                    </h3>
                    <p className="text-white/90 text-base">
                      Get inspired by photos and stories from real travelers
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Make a perfect plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group cursor-pointer"
            >
              <div className="relative h-90 rounded-3xl overflow-hidden bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 p-8 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="absolute inset-0 bg-gradient-to-br from-green-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Calendar className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      Make a Perfect Plan
                    </h3>
                    <p className="text-white/90 text-base">
                      Collaborate with others to create unforgettable journeys
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Explore by Category Section - Desktop/Tablet Only */}
        <AnimatePresence>
          {showExploreCategories && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-12 hidden md:block"
            >
              <div className="space-y-6">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                  Explore by category
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Outdoors Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    whileHover={{ scale: 1.03 }}
                    className="group cursor-pointer"
                    onClick={() => setSelectedCategory('outdoors')}
                  >
                    <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                      <img 
                        src="/img6.jpg" 
                        alt="Outdoors"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                          Outdoors
                        </h3>
                      </div>
                    </div>
                  </motion.div>

                  {/* Food Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.03 }}
                    className="group cursor-pointer"
                  >
                    <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                      <img 
                        src="/img7.jpg" 
                        alt="Food"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                          Food
                        </h3>
                      </div>
                    </div>
                  </motion.div>

                  {/* Culture Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.03 }}
                    className="group cursor-pointer"
                  >
                    <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                      <img 
                        src="/img8.jpg" 
                        alt="Culture"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                          Culture
                        </h3>
                      </div>
                    </div>
                  </motion.div>

                  {/* Water Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.03 }}
                    className="group cursor-pointer"
                  >
                    <div className="relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
                      <img 
                        src="/img9.jpg" 
                        alt="Water"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                          Water
                        </h3>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category Explore Section (Full Screen) */}
        <AnimatePresence>
          {selectedCategory === 'outdoors' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 z-50 bg-black"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedCategory(null)}
                className="absolute top-6 right-6 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300 group"
              >
                <X className="h-6 w-6 text-white" />
              </button>

              {/* Background Video */}
              <div className="relative w-full h-full">
                <video 
                  ref={videoRef}
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src="/v1.mp4" type="video/mp4" />
                </video>
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
                
                {/* Content - Scrollable */}
                <div 
                  className="relative z-10 h-full overflow-y-auto overflow-x-hidden hide-scrollbar"
                  style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  } as React.CSSProperties}
                >
                  <style>{`
                    .hide-scrollbar::-webkit-scrollbar {
                      display: none;
                      width: 0;
                      height: 0;
                    }
                  `}</style>
                  <div className="min-h-full flex flex-col items-center justify-between px-4 py-12">
                    {/* Search Bar and Cascading Dropdowns */}
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="w-full max-w-2xl"
                    >
                    {/* Search Bar */}
                    <div className="relative dropdown-container">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 z-10" />
                      <input
                        type="text"
                        placeholder="Search by country, state, or area"
                        value={searchDestination}
                        onChange={(e) => setSearchDestination(e.target.value)}
                        className="w-full pl-16 pr-6 py-5 rounded-full bg-white text-gray-900 placeholder-gray-500 text-lg focus:outline-none focus:ring-4 focus:ring-white/30 shadow-2xl transition-all"
                      />
                    </div>

                    {/* Cascading Dropdown System */}
                    <div className="mt-6 space-y-4 dropdown-container">
                      {/* Country Selection Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowCountryDropdown(!showCountryDropdown);
                            setShowStateDropdown(false);
                            setShowPlaceDropdown(false);
                          }}
                          className="w-full px-6 py-4 bg-white rounded-2xl text-left font-semibold text-gray-900 shadow-xl hover:shadow-2xl transition-all flex items-center justify-between"
                        >
                          <span>{selectedCountry || 'Select Country'}</span>
                          <Calendar className="h-5 w-5 text-gray-400" />
                        </button>
                        
                        {showCountryDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-2xl overflow-hidden z-30"
                          >
                            <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                              {COUNTRIES.map((country, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    setSelectedCountry(country);
                                    setSelectedState('');
                                    setSearchDestination('');
                                    setShowCountryDropdown(false);
                                    if (country === 'India') {
                                      setShowStateDropdown(true);
                                    }
                                  }}
                                  className="w-full text-left px-6 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                                >
                                  <p className="font-medium text-gray-900">{country}</p>
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {/* State Selection Dropdown (Only for India) */}
                      {selectedCountry === 'India' && (
                        <div className="relative">
                          <button
                            onClick={() => {
                              setShowStateDropdown(!showStateDropdown);
                              setShowPlaceDropdown(false);
                            }}
                            className="w-full px-6 py-4 bg-white rounded-2xl text-left font-semibold text-gray-900 shadow-xl hover:shadow-2xl transition-all flex items-center justify-between"
                          >
                            <span>{selectedState || 'Select State'}</span>
                            <Calendar className="h-5 w-5 text-gray-400" />
                          </button>
                          
                          {showStateDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-2xl overflow-hidden z-30"
                            >
                              <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                {availableStates.map((state, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setSelectedState(state);
                                      setSearchDestination('');
                                      setShowStateDropdown(false);
                                      setShowPlaceDropdown(true);
                                    }}
                                    className="w-full text-left px-6 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                                  >
                                    <p className="font-medium text-gray-900">{state}</p>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* Tourist Places Dropdown (Based on Selected State) */}
                      {selectedCountry === 'India' && selectedState && (
                        <div className="relative">
                          <button
                            onClick={() => setShowPlaceDropdown(!showPlaceDropdown)}
                            className="w-full px-6 py-4 bg-white rounded-2xl text-left font-semibold text-gray-900 shadow-xl hover:shadow-2xl transition-all flex items-center justify-between"
                          >
                            <span>{searchDestination || 'Select Tourist Place'}</span>
                            <Compass className="h-5 w-5 text-gray-400" />
                          </button>
                          
                          {showPlaceDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute top-full mt-2 w-full bg-white rounded-2xl shadow-2xl overflow-hidden z-30"
                            >
                              <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                {touristPlaces.map((place, index) => (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setSearchDestination(place);
                                      setShowPlaceDropdown(false);
                                    }}
                                    className="w-full text-left px-6 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                                        <Compass className="h-4 w-4 text-blue-600" />
                                      </div>
                                      <p className="font-medium text-gray-900">{place}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Popular Attractions Cards - Centered */}
                  {searchDestination && attractions.length > 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="w-full max-w-7xl flex-1 flex flex-col items-center justify-center my-12"
                    >
                      <motion.h2 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-4xl md:text-5xl font-bold text-white mb-10 drop-shadow-2xl text-center"
                      >
                        Popular Attractions in {searchDestination}
                      </motion.h2>

                      {/* Mobile Layout - Show details inline */}
                      <div className="md:hidden w-full px-4 space-y-6">
                        {attractions.map((attraction, index) => (
                          <React.Fragment key={index}>
                            <motion.div
                              initial={{ opacity: 0, y: 40, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              transition={{ 
                                delay: 0.4 + (0.1 * index),
                                duration: 0.5,
                                type: "spring",
                                stiffness: 100
                              }}
                              whileHover={{ 
                                scale: 1.08, 
                                y: -10,
                                rotateY: 5,
                                transition: { duration: 0.3 }
                              }}
                              onClick={() => handleAttractionClick(attraction.name, !!attraction.images)}
                              className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer group relative overflow-hidden"
                            >
                              {/* Background Image for Tirumala Temple with Shuffle Animation */}
                              {attraction.images && (
                                <div className="absolute inset-0 rounded-3xl overflow-hidden">
                                  <AnimatePresence mode="wait">
                                    <motion.img
                                      key={currentTempleImageIndex}
                                      src={attraction.images[currentTempleImageIndex]}
                                      alt={attraction.name}
                                      initial={{ opacity: 0, scale: 1.1 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.9 }}
                                      transition={{ duration: 1 }}
                                      className="absolute inset-0 w-full h-full object-cover"
                                    />
                                  </AnimatePresence>
                                  {/* Dark overlay for better text readability */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
                                </div>
                              )}
                              
                              <div className="flex flex-col items-center text-center gap-4 relative z-10">
                                {attraction.images ? (
                                  <>
                                    <motion.div 
                                      className="text-6xl mb-2 drop-shadow-2xl"
                                      animate={{ 
                                        scale: [1, 1.1, 1],
                                        rotate: [0, 5, -5, 0]
                                      }}
                                      transition={{ 
                                        duration: 2,
                                        repeat: Infinity,
                                        repeatDelay: 3
                                      }}
                                    >
                                      {attraction.icon}
                                    </motion.div>
                                    <div>
                                      <h3 className="font-bold text-white text-2xl mb-3 group-hover:text-yellow-300 transition-colors drop-shadow-lg">
                                        {attraction.name}
                                      </h3>
                                      <p className="text-base text-gray-100 leading-relaxed drop-shadow-md">
                                        {attraction.description}
                                      </p>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <motion.div 
                                      className="text-6xl mb-2"
                                      animate={{ 
                                        scale: [1, 1.1, 1],
                                        rotate: [0, 5, -5, 0]
                                      }}
                                      transition={{ 
                                        duration: 2,
                                        repeat: Infinity,
                                        repeatDelay: 3
                                      }}
                                    >
                                      {attraction.icon}
                                    </motion.div>
                                    <div>
                                      <h3 className="font-bold text-gray-900 text-2xl mb-3 group-hover:text-blue-600 transition-colors">
                                        {attraction.name}
                                      </h3>
                                      <p className="text-base text-gray-600 leading-relaxed">
                                        {attraction.description}
                                      </p>
                                    </div>
                                  </>
                                )}
                              </div>
                            </motion.div>

                            {/* Temple Details - Shows immediately after clicked card on mobile */}
                            {selectedAttraction === attraction.name && TEMPLE_DETAILS[selectedAttraction] && (
                              <motion.div
                                ref={templeDetailsRef}
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 40 }}
                                transition={{ duration: 0.5 }}
                                className="w-full"
                              >
                                <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl">
                                  {/* Header with Close Button */}
                                  <div className="flex items-start justify-between mb-6 gap-4">
                                    <motion.h2 
                                      initial={{ x: -20, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent"
                                    >
                                      {TEMPLE_DETAILS[selectedAttraction].title}
                                    </motion.h2>
                                    <button
                                      onClick={closeAttractionDetails}
                                      className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex-shrink-0"
                                    >
                                      <X className="h-5 w-5 text-gray-700" />
                                    </button>
                                  </div>

                                  {/* Main Description */}
                                  <motion.p 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-base text-gray-700 mb-4 leading-relaxed"
                                  >
                                    {TEMPLE_DETAILS[selectedAttraction].description}
                                  </motion.p>

                                  {/* History Section */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="mb-4"
                                  >
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">History</h3>
                                    <p className="text-sm text-gray-700 leading-relaxed">
                                      {TEMPLE_DETAILS[selectedAttraction].history}
                                    </p>
                                  </motion.div>

                                  {/* Significance */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.4 }}
                                    className="mb-4"
                                  >
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Significance</h3>
                                    <p className="text-sm text-gray-700 leading-relaxed">
                                      {TEMPLE_DETAILS[selectedAttraction].significance}
                                    </p>
                                  </motion.div>

                                  {/* Key Features */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="mb-6"
                                  >
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">Key Features</h3>
                                    <ul className="space-y-2">
                                      {TEMPLE_DETAILS[selectedAttraction].features.map((feature: string, idx: number) => (
                                        <motion.li
                                          key={idx}
                                          initial={{ x: -20, opacity: 0 }}
                                          animate={{ x: 0, opacity: 1 }}
                                          transition={{ delay: 0.6 + (idx * 0.1) }}
                                          className="flex items-start gap-2"
                                        >
                                          <span className="text-orange-600 text-lg mt-1 flex-shrink-0">•</span>
                                          <span className="text-sm text-gray-700">{feature}</span>
                                        </motion.li>
                                      ))}
                                    </ul>
                                  </motion.div>

                                  {/* Temple Images Gallery - Auto Slider */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.8 }}
                                    className="mb-4"
                                  >
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Temple Gallery</h3>
                                    <div className="relative group">
                                      {/* Main Image Slider */}
                                      <div className="relative rounded-xl overflow-hidden shadow-2xl h-64">
                                        <AnimatePresence mode="wait">
                                          <motion.img
                                            key={gallerySlideIndex}
                                            src={TEMPLE_DETAILS[selectedAttraction].images[gallerySlideIndex]}
                                            alt={`${TEMPLE_DETAILS[selectedAttraction].title} - View ${gallerySlideIndex + 1}`}
                                            initial={{ opacity: 0, x: 100 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -100 }}
                                            transition={{ duration: 0.5 }}
                                            className="w-full h-full object-cover"
                                          />
                                        </AnimatePresence>
                                        
                                        {/* Previous Button */}
                                        <button
                                          onClick={() => {
                                            setGallerySlideIndex((prev) => 
                                              prev === 0 
                                                ? TEMPLE_DETAILS[selectedAttraction].images.length - 1 
                                                : prev - 1
                                            );
                                          }}
                                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg opacity-60 transition-all duration-300 hover:scale-110"
                                        >
                                          <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        
                                        {/* Next Button */}
                                        <button
                                          onClick={() => {
                                            setGallerySlideIndex((prev) => 
                                              (prev + 1) % TEMPLE_DETAILS[selectedAttraction].images.length
                                            );
                                          }}
                                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg opacity-60 transition-all duration-300 hover:scale-110"
                                        >
                                          <ChevronRight className="h-5 w-5" />
                                        </button>
                                        
                                        {/* Slide Counter */}
                                        <div className="absolute bottom-3 left-3 bg-black/60 text-white px-3 py-1.5 rounded-full text-sm font-semibold">
                                          {gallerySlideIndex + 1} / {TEMPLE_DETAILS[selectedAttraction].images.length}
                                        </div>
                                      </div>
                                      
                                      {/* Thumbnail Indicators */}
                                      <div className="flex justify-start gap-2 mt-4 overflow-x-auto pb-2">
                                        {TEMPLE_DETAILS[selectedAttraction].images.map((image: string, idx: number) => (
                                          <motion.button
                                            key={idx}
                                            onClick={() => setGallerySlideIndex(idx)}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={`relative rounded-lg overflow-hidden transition-all duration-300 flex-shrink-0 w-20 h-[60px] ${
                                              gallerySlideIndex === idx 
                                                ? 'ring-3 ring-orange-500 shadow-xl' 
                                                : 'ring-2 ring-gray-300 opacity-60 hover:opacity-100'
                                            }`}
                                          >
                                            <img
                                              src={image}
                                              alt={`Thumbnail ${idx + 1}`}
                                              className="w-full h-full object-cover"
                                            />
                                            {gallerySlideIndex === idx && (
                                              <motion.div
                                                layoutId="activeSlide"
                                                className="absolute inset-0 border-2 border-orange-500 bg-orange-500/20"
                                              />
                                            )}
                                          </motion.button>
                                        ))}
                                      </div>
                                    </div>
                                  </motion.div>

                                  {/* Visiting Information */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.2 }}
                                    className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-4"
                                  >
                                    <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                                      <Calendar className="h-4 w-4 text-orange-600" />
                                      Visiting Information
                                    </h3>
                                    <div className="space-y-2 text-gray-700 text-sm">
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Timings:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.timings}</span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Entry Fee:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.entryFee}</span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Dress Code:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.dresscode}</span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Best Time:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.bestTimeToVisit}</span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Daily Visitors:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.dailyVisitors}</span>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-semibold">Special Days:</span>
                                        <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.specialDays}</span>
                                      </div>
                                    </div>
                                  </motion.div>

                                  {/* Reviews Section - Mobile */}
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.4 }}
                                    className="mt-4"
                                  >
                                    <div className="bg-white rounded-xl p-4 shadow-lg">
                                      <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                                        <Star className="h-4 w-4 text-orange-600 fill-orange-600" />
                                        Visitor Reviews
                                      </h3>
                                      
                                      {/* Overall Rating */}
                                      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg p-3 mb-4">
                                        <div className="flex items-center gap-3">
                                          <div className="text-center">
                                            <div className="text-3xl font-bold text-orange-600">4.8</div>
                                            <div className="text-xs text-gray-600">out of 5</div>
                                          </div>
                                          <div className="flex-1">
                                            <div className="flex gap-1 mb-1">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className={`h-4 w-4 ${star <= 4 ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} />
                                              ))}
                                            </div>
                                            <p className="text-xs text-gray-600">Based on 12,450+ reviews</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Individual Reviews */}
                                      <div className="space-y-3">
                                        {/* Review 1 */}
                                        <div className="border-b border-gray-200 pb-3">
                                          <div className="flex items-start gap-2 mb-1">
                                            <div className="flex gap-0.5">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className="h-3 w-3 text-orange-500 fill-orange-500" />
                                              ))}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-900">Rajesh Kumar</span>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed">
                                            "Divine experience! The spiritual atmosphere is beyond words. The darshan was well-organized despite huge crowds. A must-visit for devotees."
                                          </p>
                                          <span className="text-xs text-gray-500 mt-1 inline-block">2 weeks ago</span>
                                        </div>

                                        {/* Review 2 */}
                                        <div className="border-b border-gray-200 pb-3">
                                          <div className="flex items-start gap-2 mb-1">
                                            <div className="flex gap-0.5">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className={`h-3 w-3 ${star <= 4 ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} />
                                              ))}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-900">Priya Sharma</span>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed">
                                            "Amazing temple architecture and peaceful surroundings. The prasadam is delicious. Online booking made the visit hassle-free."
                                          </p>
                                          <span className="text-xs text-gray-500 mt-1 inline-block">1 month ago</span>
                                        </div>

                                        {/* Review 3 */}
                                        <div>
                                          <div className="flex items-start gap-2 mb-1">
                                            <div className="flex gap-0.5">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className="h-3 w-3 text-orange-500 fill-orange-500" />
                                              ))}
                                            </div>
                                            <span className="text-xs font-semibold text-gray-900">Anand Reddy</span>
                                          </div>
                                          <p className="text-xs text-gray-700 leading-relaxed">
                                            "Blessed to visit Lord Venkateswara! The temple management is excellent. The journey up the seven hills was memorable. Highly recommended!"
                                          </p>
                                          <span className="text-xs text-gray-500 mt-1 inline-block">3 weeks ago</span>
                                        </div>
                                      </div>

                                      {/* Write Your Review Section - Mobile */}
                                      <div className="mt-6 pt-6 border-t-2 border-gray-200">
                                        <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                                          <Send className="h-4 w-4 text-orange-600" />
                                          Share Your Experience
                                        </h4>
                                        
                                        <form onSubmit={handleSubmitReview} className="space-y-4">
                                          {/* Rating Selection */}
                                          <div>
                                            <label className="text-sm font-semibold text-gray-700 mb-2 block">Your Rating</label>
                                            <div className="flex gap-2">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                  key={star}
                                                  type="button"
                                                  onClick={() => setReviewRating(star)}
                                                  className="transition-transform hover:scale-110"
                                                >
                                                  <Star 
                                                    className={`h-7 w-7 ${star <= reviewRating ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} 
                                                  />
                                                </button>
                                              ))}
                                            </div>
                                          </div>

                                          {/* Review Text */}
                                          <div>
                                            <label className="text-sm font-semibold text-gray-700 mb-2 block">Your Review</label>
                                            <Textarea
                                              value={reviewText}
                                              onChange={(e) => setReviewText(e.target.value)}
                                              placeholder="Share your experience about this temple..."
                                              className="min-h-[100px] text-sm resize-none"
                                              required
                                            />
                                          </div>

                                          {/* Image Upload */}
                                          <div>
                                            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                              <ImageIcon className="h-4 w-4" />
                                              Add Photos (Optional, Max 5)
                                            </label>
                                            <input
                                              ref={fileInputRef}
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              onChange={handleImageUpload}
                                              className="hidden"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => fileInputRef.current?.click()}
                                              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-500 transition-colors flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-orange-600"
                                            >
                                              <Upload className="h-4 w-4" />
                                              Click to upload photos
                                            </button>
                                            
                                            {/* Image Previews */}
                                            {reviewImagePreviews.length > 0 && (
                                              <div className="grid grid-cols-3 gap-2 mt-3">
                                                {reviewImagePreviews.map((preview, idx) => (
                                                  <div key={idx} className="relative group">
                                                    <img 
                                                      src={preview} 
                                                      alt={`Preview ${idx + 1}`}
                                                      className="w-full h-20 object-cover rounded-lg"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => removeReviewImage(idx)}
                                                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                      <X className="h-3 w-3" />
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                          {/* Submit Button */}
                                          <button
                                            type="submit"
                                            className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                                          >
                                            <Send className="h-4 w-4" />
                                            Submit Review
                                          </button>
                                        </form>
                                      </div>
                                    </div>
                                  </motion.div>
                                </div>
                              </motion.div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Desktop/Tablet Layout - Original grid */}
                      <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full px-8">
                        {attractions.map((attraction, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 40, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ 
                              delay: 0.4 + (0.1 * index),
                              duration: 0.5,
                              type: "spring",
                              stiffness: 100
                            }}
                            whileHover={{ 
                              scale: 1.08, 
                              y: -10,
                              rotateY: 5,
                              transition: { duration: 0.3 }
                            }}
                            onClick={() => handleAttractionClick(attraction.name, !!attraction.images)}
                            className="bg-white/95 backdrop-blur-sm rounded-3xl p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer group relative overflow-hidden"
                          >
                            {/* Background Image for Tirumala Temple with Shuffle Animation */}
                            {attraction.images && (
                              <div className="absolute inset-0 rounded-3xl overflow-hidden">
                                <AnimatePresence mode="wait">
                                  <motion.img
                                    key={currentTempleImageIndex}
                                    src={attraction.images[currentTempleImageIndex]}
                                    alt={attraction.name}
                                    initial={{ opacity: 0, scale: 1.1 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 1 }}
                                    className="absolute inset-0 w-full h-full object-cover"
                                  />
                                </AnimatePresence>
                                {/* Dark overlay for better text readability */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
                              </div>
                            )}
                            
                            <div className="flex flex-col items-center text-center gap-4 relative z-10">{attraction.images ? (
                                <>
                                  <motion.div 
                                    className="text-6xl mb-2 drop-shadow-2xl"
                                    animate={{ 
                                      scale: [1, 1.1, 1],
                                      rotate: [0, 5, -5, 0]
                                    }}
                                    transition={{ 
                                      duration: 2,
                                      repeat: Infinity,
                                      repeatDelay: 3
                                    }}
                                  >
                                    {attraction.icon}
                                  </motion.div>
                                  <div>
                                    <h3 className="font-bold text-white text-2xl mb-3 group-hover:text-yellow-300 transition-colors drop-shadow-lg">
                                      {attraction.name}
                                    </h3>
                                    <p className="text-base text-gray-100 leading-relaxed drop-shadow-md">
                                      {attraction.description}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <motion.div 
                                    className="text-6xl mb-2"
                                    animate={{ 
                                      scale: [1, 1.1, 1],
                                      rotate: [0, 5, -5, 0]
                                    }}
                                    transition={{ 
                                      duration: 2,
                                      repeat: Infinity,
                                      repeatDelay: 3
                                    }}
                                  >
                                    {attraction.icon}
                                  </motion.div>
                                  <div>
                                    <h3 className="font-bold text-gray-900 text-2xl mb-3 group-hover:text-blue-600 transition-colors">
                                      {attraction.name}
                                    </h3>
                                    <p className="text-base text-gray-600 leading-relaxed">
                                      {attraction.description}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex-1"></div>
                  )}

                  {/* Temple Detailed Information Section - Desktop Only */}
                  {selectedAttraction && TEMPLE_DETAILS[selectedAttraction] && (
                    <motion.div
                      ref={templeDetailsRef}
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 40 }}
                      transition={{ duration: 0.5 }}
                      className="hidden md:block w-full max-w-7xl px-8 my-12"
                    >
                      <div className="bg-white/95 backdrop-blur-sm rounded-3xl p-10 shadow-2xl">
                        {/* Header with Close Button */}
                        <div className="flex items-start justify-between mb-8 gap-4">
                          <motion.h2 
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent"
                          >
                            {TEMPLE_DETAILS[selectedAttraction].title}
                          </motion.h2>
                          <button
                            onClick={closeAttractionDetails}
                            className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors flex-shrink-0"
                          >
                            <X className="h-6 w-6 text-gray-700" />
                          </button>
                        </div>

                        {/* Main Description */}
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className="text-lg text-gray-700 mb-6 leading-relaxed"
                        >
                          {TEMPLE_DETAILS[selectedAttraction].description}
                        </motion.p>

                        {/* History Section */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="mb-6"
                        >
                          <h3 className="text-2xl font-bold text-gray-900 mb-3">History</h3>
                          <p className="text-base text-gray-700 leading-relaxed">
                            {TEMPLE_DETAILS[selectedAttraction].history}
                          </p>
                        </motion.div>

                        {/* Significance */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.4 }}
                          className="mb-6"
                        >
                          <h3 className="text-2xl font-bold text-gray-900 mb-3">Significance</h3>
                          <p className="text-base text-gray-700 leading-relaxed">
                            {TEMPLE_DETAILS[selectedAttraction].significance}
                          </p>
                        </motion.div>

                        {/* Key Features */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                          className="mb-8"
                        >
                          <h3 className="text-2xl font-bold text-gray-900 mb-4">Key Features</h3>
                          <ul className="space-y-2">
                            {TEMPLE_DETAILS[selectedAttraction].features.map((feature: string, idx: number) => (
                              <motion.li
                                key={idx}
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.6 + (idx * 0.1) }}
                                className="flex items-start gap-3"
                              >
                                <span className="text-orange-600 text-xl mt-1 flex-shrink-0">•</span>
                                <span className="text-base text-gray-700">{feature}</span>
                              </motion.li>
                            ))}
                          </ul>
                        </motion.div>

                        {/* Temple Images Gallery - Auto Slider */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.8 }}
                          className="mb-6"
                        >
                          <h3 className="text-2xl font-bold text-gray-900 mb-6">Temple Gallery</h3>
                          <div className="relative group">
                            {/* Main Image Slider */}
                            <div className="relative rounded-2xl overflow-hidden shadow-2xl h-[550px]">
                              <AnimatePresence mode="wait">
                                <motion.img
                                  key={gallerySlideIndex}
                                  src={TEMPLE_DETAILS[selectedAttraction].images[gallerySlideIndex]}
                                  alt={`${TEMPLE_DETAILS[selectedAttraction].title} - View ${gallerySlideIndex + 1}`}
                                  initial={{ opacity: 0, x: 100 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -100 }}
                                  transition={{ duration: 0.5 }}
                                  className="w-full h-full object-cover"
                                />
                              </AnimatePresence>
                              
                              {/* Previous Button */}
                              <button
                                onClick={() => {
                                  setGallerySlideIndex((prev) => 
                                    prev === 0 
                                      ? TEMPLE_DETAILS[selectedAttraction].images.length - 1 
                                      : prev - 1
                                  );
                                }}
                                className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-4 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                              >
                                <ChevronLeft className="h-7 w-7" />
                              </button>
                              
                              {/* Next Button */}
                              <button
                                onClick={() => {
                                  setGallerySlideIndex((prev) => 
                                    (prev + 1) % TEMPLE_DETAILS[selectedAttraction].images.length
                                  );
                                }}
                                className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-4 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                              >
                                <ChevronRight className="h-7 w-7" />
                              </button>
                              
                              {/* Slide Counter */}
                              <div className="absolute bottom-6 left-6 bg-black/60 text-white px-5 py-2.5 rounded-full text-base font-semibold">
                                {gallerySlideIndex + 1} / {TEMPLE_DETAILS[selectedAttraction].images.length}
                              </div>
                            </div>
                            
                            {/* Thumbnail Indicators */}
                            <div className="flex justify-center gap-4 mt-8">
                              {TEMPLE_DETAILS[selectedAttraction].images.map((image: string, idx: number) => (
                                <motion.button
                                  key={idx}
                                  onClick={() => setGallerySlideIndex(idx)}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.95 }}
                                  className={`relative rounded-lg overflow-hidden transition-all duration-300 w-[120px] h-[90px] ${
                                    gallerySlideIndex === idx 
                                      ? 'ring-4 ring-orange-500 shadow-xl' 
                                      : 'ring-2 ring-gray-300 opacity-60 hover:opacity-100'
                                  }`}
                                >
                                  <img
                                    src={image}
                                    alt={`Thumbnail ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  {gallerySlideIndex === idx && (
                                    <motion.div
                                      layoutId="activeSlide"
                                      className="absolute inset-0 border-2 border-orange-500 bg-orange-500/20"
                                    />
                                  )}
                                </motion.button>
                              ))}
                            </div>
                          </div>
                        </motion.div>

                        {/* Visiting Information */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.2 }}
                          className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-6"
                        >
                          <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-orange-600" />
                            Visiting Information
                          </h3>
                          <div className="space-y-3 text-gray-700">
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Timings:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.timings}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Entry Fee:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.entryFee}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Dress Code:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.dresscode}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Best Time:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.bestTimeToVisit}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Daily Visitors:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.dailyVisitors}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold min-w-[140px]">Special Days:</span>
                              <span>{TEMPLE_DETAILS[selectedAttraction].visitingInfo.specialDays}</span>
                            </div>
                          </div>
                        </motion.div>

                        {/* Reviews Section - Desktop */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.4 }}
                          className="mt-8"
                        >
                          <div className="bg-white rounded-2xl p-6 shadow-lg">
                            <h3 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <Star className="h-6 w-6 text-orange-600 fill-orange-600" />
                              Visitor Reviews
                            </h3>
                            
                            {/* Overall Rating */}
                            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-6 mb-6">
                              <div className="flex items-center gap-6">
                                <div className="text-center">
                                  <div className="text-5xl font-bold text-orange-600">4.8</div>
                                  <div className="text-sm text-gray-600 mt-1">out of 5</div>
                                </div>
                                <div className="flex-1">
                                  <div className="flex gap-2 mb-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <Star key={star} className={`h-6 w-6 ${star <= 4 ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} />
                                    ))}
                                  </div>
                                  <p className="text-gray-600">Based on 12,450+ reviews</p>
                                </div>
                              </div>
                            </div>

                            {/* Individual Reviews */}
                            <div className="space-y-4">
                              {/* Review 1 */}
                              <div className="border-b border-gray-200 pb-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="font-semibold text-gray-900">Rajesh Kumar</span>
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star key={star} className="h-4 w-4 text-orange-500 fill-orange-500" />
                                        ))}
                                      </div>
                                    </div>
                                    <span className="text-sm text-gray-500">2 weeks ago</span>
                                  </div>
                                </div>
                                <p className="text-gray-700 leading-relaxed">
                                  "Divine experience! The spiritual atmosphere is beyond words. The darshan was well-organized despite huge crowds. A must-visit for devotees."
                                </p>
                              </div>

                              {/* Review 2 */}
                              <div className="border-b border-gray-200 pb-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="font-semibold text-gray-900">Priya Sharma</span>
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star key={star} className={`h-4 w-4 ${star <= 4 ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} />
                                        ))}
                                      </div>
                                    </div>
                                    <span className="text-sm text-gray-500">1 month ago</span>
                                  </div>
                                </div>
                                <p className="text-gray-700 leading-relaxed">
                                  "Amazing temple architecture and peaceful surroundings. The prasadam is delicious. Online booking made the visit hassle-free."
                                </p>
                              </div>

                              {/* Review 3 */}
                              <div>
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="font-semibold text-gray-900">Anand Reddy</span>
                                      <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star key={star} className="h-4 w-4 text-orange-500 fill-orange-500" />
                                        ))}
                                      </div>
                                    </div>
                                    <span className="text-sm text-gray-500">3 weeks ago</span>
                                  </div>
                                </div>
                                <p className="text-gray-700 leading-relaxed">
                                  "Blessed to visit Lord Venkateswara! The temple management is excellent. The journey up the seven hills was memorable. Highly recommended!"
                                </p>
                              </div>
                            </div>

                            {/* Write Your Review Section - Desktop */}
                            <div className="mt-8 pt-8 border-t-2 border-gray-200">
                              <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <Send className="h-5 w-5 text-orange-600" />
                                Share Your Experience
                              </h4>
                              
                              <form onSubmit={handleSubmitReview} className="space-y-6">
                                {/* Rating Selection */}
                                <div>
                                  <label className="text-sm font-semibold text-gray-700 mb-3 block">Your Rating</label>
                                  <div className="flex gap-3">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() => setReviewRating(star)}
                                        className="transition-transform hover:scale-110"
                                      >
                                        <Star 
                                          className={`h-8 w-8 ${star <= reviewRating ? 'text-orange-500 fill-orange-500' : 'text-gray-300'}`} 
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Review Text */}
                                <div>
                                  <label className="text-sm font-semibold text-gray-700 mb-3 block">Your Review</label>
                                  <Textarea
                                    value={reviewText}
                                    onChange={(e) => setReviewText(e.target.value)}
                                    placeholder="Share your experience about this temple..."
                                    className="min-h-[120px] resize-none"
                                    required
                                  />
                                </div>

                                {/* Image Upload */}
                                <div>
                                  <label className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                    <ImageIcon className="h-5 w-5" />
                                    Add Photos (Optional, Maximum 5 photos)
                                  </label>
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageUpload}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full px-6 py-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-orange-500 transition-colors flex items-center justify-center gap-3 text-gray-600 hover:text-orange-600"
                                  >
                                    <Upload className="h-6 w-6" />
                                    <span className="font-medium">Click to upload photos from your visit</span>
                                  </button>
                                  
                                  {/* Image Previews */}
                                  {reviewImagePreviews.length > 0 && (
                                    <div className="grid grid-cols-5 gap-3 mt-4">
                                      {reviewImagePreviews.map((preview, idx) => (
                                        <div key={idx} className="relative group">
                                          <img 
                                            src={preview} 
                                            alt={`Preview ${idx + 1}`}
                                            className="w-full h-24 object-cover rounded-lg shadow-md"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeReviewImage(idx)}
                                            className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Submit Button */}
                                <button
                                  type="submit"
                                  className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
                                >
                                  <Send className="h-5 w-5" />
                                  Submit Your Review
                                </button>
                              </form>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {/* Bottom Content */}
                  <div className="w-full px-8">
                    {/* Title and Video Control */}
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="flex items-center justify-between"
                    >
                      <h1 className="text-5xl md:text-6xl font-bold text-white drop-shadow-2xl">
                        Explore the outdoors
                      </h1>

                      {/* Video Control */}
                      <button 
                        onClick={() => {
                          if (videoRef.current) {
                            if (isVideoPlaying) {
                              videoRef.current.pause();
                              setIsVideoPlaying(false);
                            } else {
                              videoRef.current.play();
                              setIsVideoPlaying(true);
                            }
                          }
                        }}
                        className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-300"
                      >
                        {isVideoPlaying ? (
                          <PauseCircle className="h-8 w-8 text-white" />
                        ) : (
                          <PlayCircle className="h-8 w-8 text-white" />
                        )}
                      </button>
                    </motion.div>
                  </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Community Rooms Section - Hidden when category is selected */}
        {!selectedCategory && (
          <>
            {/* Header */}
            <motion.div
              ref={communityRoomsRef}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-8 rounded-3xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 shadow-xl">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-extrabold bg-gradient-to-r from-rose-600 to-pink-500 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
                      Community Rooms
                </h1>
              </div>
              <p className="text-lg text-gray-600 dark:text-gray-300 ml-1">
                Connect, share, and explore with fellow travelers 🌍
              </p>
              {user && (
                <div className="flex items-center gap-2 mt-3 ml-1">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-rose-500/10 to-pink-500/10 dark:from-rose-400/10 dark:to-pink-400/10 border border-rose-500/20 dark:border-rose-400/20">
                    <Crown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                      {userCreatedRoomsCount}/5 Rooms Created
                    </span>
                  </div>
                </div>
              )}
            </div>
        
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  disabled={userCreatedRoomsCount >= 5}
                  className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-8 py-6 text-lg font-semibold"
                >
                  <Plus className="h-6 w-6 mr-2" />
                  Create New Room
                  <Sparkles className="h-5 w-5 ml-2" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent">
                    Create New Chat Room
                  </DialogTitle>
                  <DialogDescription className="text-base">
                    Create a password-protected room with custom images ({userCreatedRoomsCount}/5 rooms created)
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateRoom} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="roomName" className="text-sm font-semibold">Room Name</Label>
                    <Input
                      id="roomName"
                      placeholder="e.g., Travel Planning, Beach Trip 2026"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      required
                      className="h-12 rounded-xl border-2 focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roomDescription" className="text-sm font-semibold">Description (Optional)</Label>
                    <Input
                      id="roomDescription"
                      placeholder="What's this room about?"
                      value={newRoomDescription}
                      onChange={(e) => setNewRoomDescription(e.target.value)}
                      className="h-12 rounded-xl border-2 focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roomPassword" className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Room Password
                    </Label>
                    <Input
                      id="roomPassword"
                      type="password"
                      placeholder="Enter a secure password"
                      value={newRoomPassword}
                      onChange={(e) => setNewRoomPassword(e.target.value)}
                      required
                      className="h-12 rounded-xl border-2 focus:border-primary"
                    />
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      This password will be required to join the room
                    </p>
                  </div>
                  
                  {/* Background Image Upload */}
                  <div className="space-y-2">
                    <Label htmlFor="backgroundImage" className="text-sm font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      Room Background Image (Optional)
                    </Label>
                    <div className="space-y-3">
                      {backgroundImagePreview ? (
                        <div className="relative group">
                          <img 
                            src={backgroundImagePreview} 
                            alt="Background preview" 
                            className="w-full h-32 object-cover rounded-xl border-2 border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={removeBackgroundImage}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                            {(backgroundImageFile!.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      ) : (
                        <label htmlFor="backgroundImage" className="cursor-pointer">
                          <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors">
                            <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            <p className="text-sm text-gray-500">Click to upload background</p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP (Max 5MB)</p>
                          </div>
                        </label>
                      )}
                      <Input
                        id="backgroundImage"
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundImageChange}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Icon Image Upload */}
                  <div className="space-y-2">
                    <Label htmlFor="iconImage" className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Room Icon (Optional)
                    </Label>
                    <div className="space-y-3">
                      {iconImagePreview ? (
                        <div className="relative group inline-block">
                          <img 
                            src={iconImagePreview} 
                            alt="Icon preview" 
                            className="w-24 h-24 object-cover rounded-xl border-2 border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={removeIconImage}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute bottom-1 left-1 bg-black/60 text-white px-1.5 py-0.5 rounded text-xs">
                            {(iconImageFile!.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      ) : (
                        <label htmlFor="iconImage" className="cursor-pointer inline-block">
                          <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors">
                            <Upload className="h-6 w-6 text-gray-400 mb-1" />
                            <p className="text-xs text-gray-500 text-center px-1">Upload icon</p>
                          </div>
                        </label>
                      )}
                      <Input
                        id="iconImage"
                        type="file"
                        accept="image/*"
                        onChange={handleIconImageChange}
                        className="hidden"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Square images work best (recommended: 256x256px)
                    </p>
                  </div>

                  {uploadingImages && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                      <p className="text-sm text-blue-700 font-medium">Uploading images...</p>
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-semibold shadow-lg" 
                    disabled={creating}
                  >
                    {creating ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                        {uploadingImages ? 'Uploading...' : 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Plus className="h-5 w-5 mr-2" />
                        Create Room
                      </>
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        {/* Rooms Grid */}
        {rooms.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="text-center py-16 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border-2 border-dashed border-primary/30 rounded-3xl shadow-xl">
              <CardContent>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="mb-6"
                >
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-pink-400 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                    <div className="relative p-6 rounded-full bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-900/40 dark:to-pink-900/40">
                      <MessageCircle className="h-16 w-16 text-rose-600 dark:text-rose-400" />
                    </div>
                  </div>
                </motion.div>
                <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent">
                  No Chat Rooms Yet
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                  Be the first to create a chat room and start connecting! ✨
                </p>
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-8 py-6 text-lg font-semibold"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create First Room
                  <Sparkles className="h-5 w-5 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <AnimatePresence mode="popLayout">
              {rooms.map((room, index) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -8, transition: { duration: 0.2 } }}
                  layout
                >
                  <Card
                    className="cursor-pointer h-full bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 shadow-lg hover:shadow-2xl hover:border-primary/50 transition-all duration-300 rounded-2xl overflow-hidden group"
                    onClick={() => navigate(`/chat/room/${room.id}`)}
                  >
                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/0 via-pink-500/0 to-red-500/0 group-hover:from-rose-500/5 group-hover:via-pink-500/5 group-hover:to-red-500/5 transition-all duration-300 pointer-events-none"></div>
                    
                    <CardHeader className="relative">
                      <CardTitle className="flex items-center gap-2.5 text-xl">
                        {/* Room Icon */}
                        {room.iconImage ? (
                          <Avatar className="h-10 w-10 border-2 border-primary/20">
                            <AvatarImage src={room.iconImage.url} alt={room.name} />
                            <AvatarFallback>{room.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-md group-hover:shadow-lg transition-shadow">
                            <MessageCircle className="h-5 w-5 text-white" />
                          </div>
                        )}
                        <span className="flex-1 truncate group-hover:text-primary transition-colors">
                          {room.name}
                        </span>
                        {room.password && (
                          <div className="p-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-400/10">
                            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                        )}
                      </CardTitle>
                      <CardDescription className="text-base mt-2">
                        {room.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2.5 text-gray-600 dark:text-gray-300">
                          <div className="p-1.5 rounded-lg bg-rose-500/10 dark:bg-rose-400/10">
                            <Users className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                          </div>
                          <span className="font-medium">{room.participants?.length || 0} participants</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-gray-600 dark:text-gray-300">
                          <div className="p-1.5 rounded-lg bg-pink-500/10 dark:bg-pink-400/10">
                            <Clock className="h-4 w-4 text-pink-600 dark:text-pink-400" />
                          </div>
                          <span className="font-medium">Created {formatDate(room.createdAt)}</span>
                        </div>
                      </div>
                      
                      {/* Action buttons for room creator */}
                      {user && room.createdBy === user.uid && (
                        <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-xl border-2 hover:border-primary hover:bg-primary/5 transition-all"
                            onClick={(e) => handleShareRoom(room, e)}
                          >
                            <Share2 className="h-4 w-4 mr-1.5" />
                            Share
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-800 transition-all"
                            onClick={(e) => handleDeleteRoom(room.id!, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        
        {/* Share Dialog */}
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Share2 className="h-6 w-6 text-primary" />
                Share Room: {shareRoom?.name}
              </DialogTitle>
              <DialogDescription className="text-base">
                Share this room with others using an invite link or room credentials
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Invite Link */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Invite Link (No Password Required)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={shareRoom?.id && shareRoom?.inviteToken ? chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken) : ''}
                    readOnly
                    className="flex-1 font-mono text-sm bg-gray-50 dark:bg-gray-900 rounded-xl border-2"
                  />
                  <Button 
                    onClick={copyInviteLink} 
                    variant="outline"
                    className="rounded-xl border-2 hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copiedInvite ? '✓ Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-200 dark:border-rose-800">
                  💡 Anyone with this link can join directly without a password
                </p>
              </div>
              
              {/* Room Credentials */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Room Credentials
                </Label>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl border-2 border-gray-200 dark:border-gray-700 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      Room ID
                    </p>
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg">
                      {shareRoom?.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Password
                    </p>
                    <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg">
                      {shareRoom?.password}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={copyCredentials} 
                  variant="outline" 
                  className="w-full h-12 rounded-xl border-2 hover:border-primary hover:bg-primary/5 font-semibold transition-all"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedPassword ? '✓ Copied!' : 'Copy ID & Password'}
                </Button>
                <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  🔐 Share these credentials for manual room access
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Main Chat Page with routing
 */
const ChatPage: React.FC = () => {
  const location = useLocation();
  const isInChatRoom = location.pathname.includes('/room/');

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
      {!isInChatRoom && <Header />}
      <Routes>
        <Route index element={<ChatRoomsList />} />
        <Route path="room/:roomId" element={<ChatRoom />} />
      </Routes>
    </div>
  );
};

export default ChatPage;
