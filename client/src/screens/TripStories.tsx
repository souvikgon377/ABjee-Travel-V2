'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Share2, MapPin, Calendar, Clock, DollarSign,
  Users, X, ChevronDown, Search, Upload, Play, Copy, Check, Send,
  ArrowLeft, Image as ImageIcon, Plus, Trash2, Pencil,
  Maximize2, Minimize2,
  Facebook, Instagram, Youtube, Globe, Camera, Star,
  BookOpen
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove,
  query, orderBy, serverTimestamp, onSnapshot, limit
} from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import Header1 from '@/components/mvpblocks/header-1';
import CommunityHeader from '@/components/mvpblocks/community-header';
import { buildAbjeeShareText } from '@/lib/socialShare';
import { modernConfirm, modernAlert } from '@/lib/modernDialog';

// --------------------------- Types ---------------------------

interface VideoEmbed {
  url: string;
  platform: 'youtube' | 'facebook' | 'instagram' | 'unknown';
  embedUrl: string;
}

interface Comment {
  id: string;
  userName: string;
  text: string;
  createdAt: any;
  userId?: string;
  userEmail?: string;
  userAvatar?: string;
}

interface StoryPhoto {
  url: string;
  caption: string;
  publicId?: string;
}

interface TripStory {
  id: string;
  title: string;
  destination: string;
  authorName: string;
  authorEmail?: string;
  authorId?: string;
  coverImage: string;
  description: string;
  fullStory?: string;
  tripHighlights?: string;
  dayByDay?: string;
  bestPlaces?: string;
  localFood?: string;
  travelTips?: string;
  startDate: string;
  endDate: string;
  duration: string;
  budget: string;
  travelType: 'Solo' | 'Couple' | 'Family' | 'Group';
  photos: StoryPhoto[];
  videos: VideoEmbed[];
  likes: string[];
  commentCount: number;
  createdAt: any;
  featured?: boolean;
  lat?: number;
  lng?: number;
}

// ----------------------- Utility Helpers ---------------------

function parseVideoEmbed(url: string): VideoEmbed {
  const trimmed = url.trim();

  // YouTube
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return { url: trimmed, platform: 'youtube', embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }

  // Facebook video, reel, or share URL (including /share/r/ and /share/v/ shortlinks)
  if (trimmed.includes('facebook.com') && (trimmed.includes('/video') || trimmed.includes('/reel') || trimmed.includes('/share/'))) {
    const encoded = encodeURIComponent(trimmed);
    return {
      url: trimmed,
      platform: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=false&autoplay=false`,
    };
  }

  // Instagram reel / post
  const igMatch = trimmed.match(/instagram\.com\/(reel|p)\/([A-Za-z0-9_-]+)/);
  if (igMatch) {
    return {
      url: trimmed,
      platform: 'instagram',
      embedUrl: `https://www.instagram.com/${igMatch[1]}/${igMatch[2]}/embed/`,
    };
  }

  return { url: trimmed, platform: 'unknown', embedUrl: '' };
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'youtube') return <Youtube className="w-4 h-4 text-red-500" />;
  if (platform === 'facebook') return <Facebook className="w-4 h-4 text-blue-600" />;
  if (platform === 'instagram') return <Instagram className="w-4 h-4 text-pink-500" />;
  return <Globe className="w-4 h-4 text-gray-400" />;
}

// Facebook videos cannot be reliably embedded via iframe (requires registered app domain,
// public video, and canonical URL - share/v/ shortlinks are unsupported by the plugin).
// Show a branded card that opens the video on Facebook instead.
function FacebookCard({ url, title }: { url: string; title: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative aspect-video flex flex-col items-center justify-center gap-3 bg-linear-to-br from-[#1877f2]/20 via-neutral-900 to-neutral-900 group overflow-hidden cursor-pointer no-underline"
    >
      <div className="w-16 h-16 rounded-full bg-[#1877f2] flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
        <Facebook className="w-8 h-8 text-white" fill="white" />
      </div>
      <p className="text-white/80 text-sm font-medium text-center px-4 line-clamp-2">{title}</p>
      <span className="bg-[#1877f2] text-white text-xs font-semibold px-4 py-1.5 rounded-full group-hover:bg-[#1565d8] transition-colors">
        Watch on Facebook
      </span>
    </a>
  );
}

// Lazy-load YouTube iframe only when user clicks play (facade pattern)
function YouTubeFacade({ embedUrl, title }: { embedUrl: string; title: string }) {
  const [active, setActive] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const videoId = (() => {
    const m = embedUrl.match(/(?:embed\/|v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  })();

  const nocookieUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
    : embedUrl;

  const thumb = (!thumbError && videoId)
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : null;

  if (active) {
    return (
      <div className="relative aspect-video">
        <iframe
          src={nocookieUrl}
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
        />
      </div>
    );
  }

  return (
    <div
      className="relative aspect-video cursor-pointer group overflow-hidden"
      onClick={() => setActive(true)}
    >
      {/* Thumbnail or gradient fallback */}
      {thumb ? (
        <img
          src={thumb}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setThumbError(true)}
        />
      ) : (
        <div className="w-full h-full bg-linear-to-br from-neutral-900 via-red-950/40 to-neutral-900 flex flex-col items-center justify-center gap-2">
          <Youtube className="w-14 h-14 text-red-500" />
          <p className="text-xs text-white/60 text-center px-4 line-clamp-2">{title}</p>
        </div>
      )}
      {/* Subtle dark overlay - lighter so play button stays visible */}
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
      {/* Play button - always on top */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
          <Play className="w-7 h-7 text-white ml-1" fill="white" />
        </div>
      </div>
      {/* "Click to play" hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Click to play
      </div>
    </div>
  );
}

const TRAVEL_TYPE_COLORS: Record<string, string> = {
  Solo: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-500/30',
  Couple: 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-400 border border-pink-300 dark:border-pink-500/30',
  Family: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-500/30',
  Group: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-500/30',
};

// Placeholder images using Unsplash (travel themed)
const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=80',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&q=80',
];

const SAMPLE_STORIES: TripStory[] = [];

// ----------------------- Sub-components ----------------------

// Story Card
function StoryCard({
  story,
  onOpen,
  currentUserId,
  onLike,
}: {
  story: TripStory;
  onOpen: (s: TripStory) => void;
  currentUserId: string | null;
  onLike: (id: string) => void;
}) {
  const liked = currentUserId ? story.likes.includes(currentUserId) : false;

  // Build deduplicated ordered image list: coverImage first, then photo urls
  const allImages = (() => {
    const imgs: string[] = [];
    const seen = new Set<string>();
    const add = (u?: string) => { if (u && !seen.has(u)) { seen.add(u); imgs.push(u); } };
    add(story.coverImage);
    story.photos?.forEach(p => add(p.url));
    if (imgs.length === 0) imgs.push(PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)]);
    return imgs;
  })();

  const [slideIdx, setSlideIdx] = useState(0);
  const [slideDir, setSlideDir] = useState(1); // 1 = forward, -1 = backward

  useEffect(() => {
    if (allImages.length <= 1) return;
    const timer = setInterval(() => {
      setSlideDir(1);
      setSlideIdx(i => (i + 1) % allImages.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [allImages.length]);

  return (
    <motion.div
      className="group bg-card rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 flex flex-col border border-border cursor-pointer h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={() => onOpen(story)}
    >
      {/* Cover Image Slideshow */}
      <div className="relative overflow-hidden h-48 bg-muted">
        <AnimatePresence initial={false} custom={slideDir}>
          <motion.img
            key={slideIdx}
            src={allImages[slideIdx]}
            alt={story.title}
            custom={slideDir}
            variants={{
              enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0.8 }),
              center: { x: '0%', opacity: 1 },
              exit: (d: number) => ({ x: `${-d * 100}%`, opacity: 0.8 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGES[0]; }}
          />
        </AnimatePresence>
        {allImages.length > 1 && (
          <div className="absolute bottom-10 right-3 flex gap-1">
            {allImages.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setSlideDir(i > slideIdx ? 1 : -1); setSlideIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === slideIdx ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
        <span className={`absolute top-3 right-3 text-xs font-semibold px-2 py-1 rounded-full ${TRAVEL_TYPE_COLORS[story.travelType]}`}>
          {story.travelType}
        </span>
        <div className="absolute bottom-3 left-3 flex items-center gap-1 text-white text-xs">
          <MapPin className="w-3 h-3" />
          <span>{story.destination}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {story.title}
        </h3>
        <p className="text-muted-foreground text-xs line-clamp-2">{story.description}</p>

        <div className="flex flex-wrap gap-2 mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" /> {story.duration}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="w-3 h-3" /> {story.budget?.startsWith('$') ? story.budget.slice(1).trim() : story.budget}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border/40">
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-rose-500 to-orange-400 flex items-center justify-center text-white text-xs font-bold">
            {story.authorName[0]}
          </div>
          <span className="text-xs text-muted-foreground flex-1 truncate">{story.authorName}</span>

          <button
            onClick={(e) => { e.stopPropagation(); onLike(story.id); }}
            className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-rose-500' : 'text-muted-foreground hover:text-rose-400'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-500' : ''}`} />
            <span>{story.likes.length}</span>
          </button>

          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{story.commentCount}</span>
          </span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onOpen(story); }}
          className="mt-2 w-full py-2 rounded-xl text-xs font-semibold bg-linear-to-r from-rose-500 to-orange-500 text-white hover:opacity-90 transition-opacity"
        >
          Read More
        </button>
      </div>
    </motion.div>
  );
}

// Featured Story Card
function FeaturedStoryCard({
  story,
  onOpen,
  currentUserId,
  onLike,
}: {
  story: TripStory;
  onOpen: (s: TripStory) => void;
  currentUserId: string | null;
  onLike: (id: string) => void;
}) {
  const liked = currentUserId ? story.likes.includes(currentUserId) : false;
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      className="relative rounded-3xl overflow-hidden shadow-2xl cursor-pointer group"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      whileHover={{ scale: 1.005 }}
      onClick={() => onOpen(story)}
    >
      <div className="relative h-105 md:h-125">
        <img
          src={imgError ? PLACEHOLDER_IMAGES[0] : story.coverImage}
          alt={story.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-transparent" />

        <div className="absolute top-5 left-5 bg-linear-to-r from-rose-500 to-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
          <Star className="w-3 h-3 fill-white" /> Best Story of the Month
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-rose-400" />
            <span className="text-rose-300 text-sm font-medium">{story.destination}</span>
          </div>
          <h2 className="text-white text-2xl md:text-3xl font-bold mb-3 leading-tight">{story.title}</h2>
          <p className="text-gray-300 text-sm mb-4 line-clamp-2">{story.description}</p>

          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-rose-500 to-orange-400 flex items-center justify-center text-white text-sm font-bold">
                {story.authorName[0]}
              </div>
              <span className="text-gray-200 text-sm">{story.authorName}</span>
            </div>
            <span className="flex items-center gap-1 text-gray-300 text-sm"><Clock className="w-4 h-4" />{story.duration}</span>
            <span className="flex items-center gap-1 text-gray-300 text-sm"><DollarSign className="w-4 h-4" />{story.budget?.startsWith('$') ? story.budget.slice(1).trim() : story.budget}</span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${TRAVEL_TYPE_COLORS[story.travelType]}`}>{story.travelType}</span>
          </div>

          <div className="flex items-center gap-3">
            <motion.button
              className="px-6 py-2.5 bg-linear-to-r from-rose-500 to-orange-500 text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity shadow-lg"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => { e.stopPropagation(); onOpen(story); }}
            >
              Read Full Story
            </motion.button>

            <button
              onClick={(e) => { e.stopPropagation(); onLike(story.id); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur text-sm transition-colors ${liked ? 'text-rose-400' : 'text-white hover:text-rose-300'}`}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-rose-400' : ''}`} />
              {story.likes.length}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Lightbox
function Lightbox({ photos, startIndex, onClose }: { photos: StoryPhoto[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex);
  const [dir, setDir] = useState(1); // 1 = forward, -1 = backward

  const goTo = (newIdx: number) => {
    if (newIdx === idx) return;
    setDir(newIdx > idx ? 1 : -1);
    setIdx(newIdx);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') { setDir(1); setIdx(i => Math.min(i + 1, photos.length - 1)); }
      if (e.key === 'ArrowLeft') { setDir(-1); setIdx(i => Math.max(i - 1, 0)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, photos.length]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-200 flex items-center justify-center bg-black/95 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative max-w-4xl w-full mx-4"
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.85 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 text-white hover:text-rose-400 transition-colors bg-white/10 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter badge */}
          <div className="absolute -top-12 left-0 text-gray-300 text-sm bg-white/10 px-3 py-1.5 rounded-full">
            {idx + 1} / {photos.length}
          </div>

          {/* Sliding image container */}
          <div className="relative overflow-hidden rounded-2xl shadow-2xl">
            <AnimatePresence initial={false} custom={dir}>
              <motion.img
                key={idx}
                src={photos[idx].url}
                alt={photos[idx].caption || `Photo ${idx + 1}`}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0 }),
                  center: { x: '0%', opacity: 1 },
                  exit: (d: number) => ({ x: `${-d * 100}%`, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="w-full object-contain max-h-[80vh]"
              />
            </AnimatePresence>
          </div>

          {photos[idx].caption && (
            <p className="text-center text-gray-300 mt-3 text-sm">{photos[idx].caption}</p>
          )}

          {/* Prev / Next arrow buttons */}
          {idx > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setDir(-1); setIdx(i => Math.max(0, i - 1)); }}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
              aria-label="Previous photo"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          {idx < photos.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setDir(1); setIdx(i => Math.min(photos.length - 1, i + 1)); }}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 bg-white/10 hover:bg-white/25 text-white rounded-full p-3 transition-colors"
              aria-label="Next photo"
            >
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </button>
          )}

          {/* Dot indicators */}
          {photos.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-4">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); goTo(i); }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === idx ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// Story Detail Modal
function StoryModal({
  story,
  onClose,
  currentUserId,
  currentUserEmail,
  onLike,
  onDelete,
  onEdit,
}: {
  story: TripStory;
  onClose: () => void;
  currentUserId: string | null;
  currentUserEmail: string | null;
  onLike: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onEdit: (story: TripStory) => void;
}) {
  const liked = currentUserId ? story.likes.includes(currentUserId) : false;
  // Match by UID (new stories) OR by email (stories submitted before authorId was added)
  const isOwner =
    (!!currentUserId && !!story.authorId && currentUserId === story.authorId) ||
    (!!currentUserEmail && !!story.authorEmail && currentUserEmail.toLowerCase() === story.authorEmail.toLowerCase());
  const { currentUser, userProfile, refreshUserProfile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentName, setCommentName] = useState(userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroDir, setHeroDir] = useState(1);
  const [isWindowExpanded, setIsWindowExpanded] = useState(false);

  useEffect(() => {
    setCommentName(userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
  }, [userProfile, currentUser]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(story.id);
      onClose();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Build deduplicated gallery list (photos array + coverImage if not already present)
  const galleryPhotos: StoryPhoto[] = (() => {
    const seen = new Set<string>();
    const list: StoryPhoto[] = [];
    const add = (url: string, caption = '') => {
      if (url && !seen.has(url)) { seen.add(url); list.push({ url, caption }); }
    };
    story.photos?.forEach(p => add(p.url, p.caption));
    if (story.coverImage) add(story.coverImage, 'Cover photo');
    return list;
  })();

  // Hero banner auto-advance slideshow
  useEffect(() => {
    if (galleryPhotos.length <= 1) return;
    const timer = setInterval(() => {
      setHeroDir(1);
      setHeroIdx(i => (i + 1) % galleryPhotos.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [galleryPhotos.length]);

  const toggleWindowExpand = () => {
    setIsWindowExpanded((prev) => !prev);
  };

  // Load comments from Firestore
  useEffect(() => {
    const colRef = collection(firestoreDb, `stories/${story.id}/comments`);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ ...(d.data() as Comment), id: d.id })));
    });
    return unsub;
  }, [story.id]);

  const submitComment = async () => {
    const trimName = commentName.trim();
    const trimText = newComment.trim();
    if (!trimName || !trimText) return;

    const hasAlreadyCommented = comments.some(c => c.userId === currentUserId);
    if (hasAlreadyCommented) {
      alert('You have already submitted a comment for this story.');
      return;
    }

    setSubmittingComment(true);
    try {
      const token = currentUser ? await currentUser.getIdToken() : '';
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetId: story.id,
          targetType: 'story',
          text: trimText,
          userName: trimName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to post comment');
      }

      setNewComment('');
      try {
        if (typeof refreshUserProfile === 'function') {
          await refreshUserProfile();
        }
      } catch (e) {
        console.warn('Failed to refresh user profile:', e);
      }
    } catch (err: any) {
      alert(err.message || 'Something went wrong while posting comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const confirmed = await modernConfirm('Are you sure you want to delete your comment?', {
      title: 'Confirm Deletion',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const token = currentUser ? await currentUser.getIdToken() : '';
      const response = await fetch(`/api/comments?commentId=${commentId}&targetId=${story.id}&targetType=story`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete comment');
      }

      try {
        if (typeof refreshUserProfile === 'function') {
          await refreshUserProfile();
        }
      } catch (e) {
        console.warn('Failed to refresh user profile:', e);
      }
    } catch (err: any) {
      await modernAlert('Failed to delete comment: ' + err.message, 'Error');
    }
  };

  const handleShare = async (platform: string) => {
    const shareUrl = new URL(`${window.location.origin}/trip-stories`);
    shareUrl.searchParams.set('story', story.id);
    shareUrl.searchParams.set('storyTitle', story.title);
    const url = shareUrl.toString();
    const shareText = buildAbjeeShareText({
      title: story.title,
      location: story.destination,
      url,
    });

    if (platform === 'copy') {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } else if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
    } else if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareText)}`);
    }
  };

  const mapUrl = story.lat && story.lng
    ? `https://maps.google.com/maps?q=${story.lat},${story.lng}&z=10&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(story.destination)}&output=embed`;

  return (
    <AnimatePresence>
      <motion.div
        data-lenis-prevent
        className="fixed inset-0 z-50 overflow-y-auto overscroll-contain touch-pan-y bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="min-h-screen py-0 flex items-start justify-center">
          <motion.div
            layout
            className={`relative bg-background w-full mx-auto min-h-screen overflow-hidden shadow-2xl transition-[max-width,margin,border-radius] duration-500 ease-out ${isWindowExpanded ? 'max-w-[98vw] md:my-2 md:rounded-2xl' : 'max-w-4xl md:my-8 md:rounded-3xl'}`}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            layoutDependency={isWindowExpanded}
            onClick={e => e.stopPropagation()}
          >
            {/* Hero Banner - auto-advancing slideshow */}
            <div className="relative h-72 md:h-96 overflow-hidden">
              <AnimatePresence initial={false} custom={heroDir}>
                <motion.img
                  key={heroIdx}
                  src={galleryPhotos[heroIdx]?.url || PLACEHOLDER_IMAGES[0]}
                  alt={story.title}
                  custom={heroDir}
                  variants={{
                    enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0.8 }),
                    center: { x: '0%', opacity: 1 },
                    exit: (d: number) => ({ x: `${-d * 100}%`, opacity: 0.8 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, ease: 'easeInOut' }}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGES[0]; }}
                />
              </AnimatePresence>
              {/* Dot indicators for hero */}
              {galleryPhotos.length > 1 && (
                <div className="absolute bottom-20 right-4 flex gap-1.5 z-10">
                  {galleryPhotos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setHeroDir(i > heroIdx ? 1 : -1); setHeroIdx(i); }}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                        i === heroIdx ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-4 left-4 bg-black/40 backdrop-blur text-white rounded-full p-2 hover:bg-black/60 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button
                  onClick={toggleWindowExpand}
                  title={isWindowExpanded ? 'Restore card width' : 'Expand to window width'}
                  className="hidden md:inline-flex bg-black/40 backdrop-blur hover:bg-black/60 text-white rounded-full p-2 transition-colors"
                >
                  {isWindowExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                {isOwner ? (
                  confirmDelete ? (
                    <>
                      <span className="text-white text-xs bg-black/60 backdrop-blur px-2 py-1 rounded-lg">Delete this story?</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(story)}
                        className="bg-black/40 backdrop-blur hover:bg-blue-600/80 text-white rounded-full p-2 transition-colors"
                        title="Edit story"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="bg-black/40 backdrop-blur hover:bg-rose-600/80 text-white rounded-full p-2 transition-colors"
                        title="Delete story"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                ) : null}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-300 text-sm">{story.destination}</span>
                </div>
                <h1 className="text-white text-2xl md:text-3xl font-bold leading-tight mb-2">{story.title}</h1>
                <div className="flex flex-wrap items-center gap-4 text-gray-300 text-sm">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{story.startDate} {'->'} {story.endDate}</span>
                  <span>by <strong className="text-white">{story.authorName}</strong></span>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Introduction */}
                <section>
                  <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-rose-500" /> Introduction
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">{story.fullStory || story.description}</p>
                </section>

                {story.tripHighlights && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-500" /> Trip Highlights
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">{story.tripHighlights}</p>
                  </section>
                )}

                {story.dayByDay && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500" /> Day-by-Day Experience
                    </h2>
                    <div className="space-y-2">
                      {story.dayByDay.split('\n').map((line, i) => (
                        <p key={i} className="text-muted-foreground text-sm leading-relaxed">{line}</p>
                      ))}
                    </div>
                  </section>
                )}

                {story.bestPlaces && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-green-500" /> Best Places Visited
                    </h2>
                    <p className="text-muted-foreground leading-relaxed">{story.bestPlaces}</p>
                  </section>
                )}

                {story.localFood && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-3">🍜 Local Food Experience</h2>
                    <p className="text-muted-foreground leading-relaxed">{story.localFood}</p>
                  </section>
                )}

                {story.travelTips && (
                  <section className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                    <h2 className="text-xl font-bold text-foreground mb-3">💡 Travel Tips</h2>
                    <p className="text-muted-foreground leading-relaxed text-sm">{story.travelTips}</p>
                  </section>
                )}

                {/* Photo Gallery */}
                {galleryPhotos.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                      <Camera className="w-5 h-5 text-purple-500" /> Photo Gallery
                      <span className="text-sm font-normal text-muted-foreground">({galleryPhotos.length} photos)</span>
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {galleryPhotos.map((photo, i) => (
                        <motion.div
                          key={i}
                          className="relative aspect-square cursor-pointer overflow-hidden rounded-xl group"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.06 }}
                          whileHover={{ scale: 1.02 }}
                          onClick={() => setLightboxIdx(i)}
                        >
                          <img src={photo.url} alt={photo.caption || `Photo ${i + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {photo.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1.5 translate-y-full group-hover:translate-y-0 transition-transform">
                              {photo.caption}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Trip Videos */}
                {story.videos.length > 0 && (
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                      <Play className="w-5 h-5 text-red-500" /> Trip Videos
                    </h2>
                    <div className="space-y-4">
                      {story.videos.map((video, i) => (
                        <div key={i} className="rounded-2xl overflow-hidden bg-black">
                          {video.platform === 'instagram' ? (
                            <div className="aspect-9/16 max-w-sm mx-auto">
                              <iframe
                                src={video.embedUrl}
                                className="w-full h-full"
                                frameBorder="0"
                                scrolling="no"
                                loading="lazy"
                                allowFullScreen
                                title={`Video ${i + 1}`}
                              />
                            </div>
                          ) : video.platform === 'facebook' ? (
                            <FacebookCard url={video.url} title={`Facebook Video ${i + 1}`} />
                          ) : video.embedUrl ? (
                            <YouTubeFacade embedUrl={video.embedUrl} title={`Video ${i + 1}`} />
                          ) : (
                            <div className="aspect-video flex flex-col items-center justify-center gap-2 bg-linear-to-br from-neutral-900 to-neutral-800">
                              <Globe className="w-10 h-10 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">Unsupported video link</p>
                              <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                                Open in browser
                              </a>
                            </div>
                          )}
                          <div className="flex items-center gap-2 p-2 bg-card">
                            <PlatformIcon platform={video.platform} />
                            <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary truncate">
                              {video.url}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Google Map */}
                <section>
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-teal-500" /> Location on Map
                  </h2>
                  <div className="rounded-2xl overflow-hidden border border-border h-64">
                    <iframe
                      src={mapUrl}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      title="Destination Map"
                    />
                  </div>
                </section>

                {/* Social Share */}
                <section>
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-blue-500" /> Share This Story
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 rounded-xl text-sm hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
                    >
                      <Globe className="w-4 h-4" /> WhatsApp
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 rounded-xl text-sm hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                    >
                      <Facebook className="w-4 h-4" /> Facebook
                    </button>
                    <button
                      onClick={() => handleShare('copy')}
                      className="flex items-center gap-2 px-4 py-2 bg-muted border border-border text-muted-foreground rounded-xl text-sm hover:bg-accent transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </section>

                {/* Like Button */}
                <div className="flex items-center gap-4">
                  <motion.button
                    onClick={() => onLike(story.id)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${liked ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40' : 'bg-muted text-muted-foreground border border-border hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400'}`}
                    whileTap={{ scale: 0.9 }}
                  >
                    <motion.div
                      animate={liked ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Heart className={`w-5 h-5 ${liked ? 'fill-rose-500' : ''}`} />
                    </motion.div>
                    {liked ? 'Liked' : 'Like'} - {story.likes.length}
                  </motion.button>
                </div>

                {/* Comment Section */}
                <section>
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-indigo-500" /> Comments
                    <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
                  </h2>

                  {/* Add comment */}
                  {currentUser ? (
                    comments.some(c => c.userId === currentUserId) ? (
                      <div className="bg-muted/60 rounded-2xl p-6 mb-4 text-center border border-border">
                        <p className="text-sm text-muted-foreground">You have already submitted a comment for this story.</p>
                      </div>
                    ) : (
                      <div className="bg-muted/60 rounded-2xl p-4 mb-4 space-y-3 border border-border">
                        <div className="text-xs text-muted-foreground px-1">
                          Commenting as <span className="font-semibold text-foreground">{userProfile?.displayName || currentUser?.displayName || currentUser?.email || 'User'}</span>
                        </div>
                      <textarea
                        placeholder="Share your thoughts about this story..."
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        rows={3}
                        className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                      />
                      <button
                        onClick={submitComment}
                        disabled={submittingComment || !commentName.trim() || !newComment.trim()}
                        className="flex items-center gap-2 px-5 py-2 bg-linear-to-r from-rose-500 to-orange-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )
                ) : (
                    <div className="bg-muted/60 rounded-2xl p-6 mb-4 text-center border border-border">
                      <p className="text-sm text-muted-foreground mb-3">You must be signed in to post a comment.</p>
                      <button
                        onClick={() => window.location.href = '/auth'}
                        className="px-5 py-2 bg-linear-to-r from-rose-500 to-orange-500 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
                      >
                        Sign In to Comment
                      </button>
                    </div>
                  )}

                  {/* Comments list */}
                  <div className="space-y-3">
                    {comments.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-6">Be the first to comment!</p>
                    )}
                    {comments.map(comment => {
                      const isCommentOwner = currentUserId && comment.userId && currentUserId === comment.userId;
                      return (
                        <div key={comment.id} className="bg-card rounded-xl p-4 border border-border/40">
                          <div className="flex items-center gap-2 mb-2">
                            {comment.userAvatar ? (
                              <img
                                src={comment.userAvatar}
                                alt={comment.userName}
                                className="w-7 h-7 rounded-full object-cover border border-border/40"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-linear-to-br from-teal-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                {comment.userName[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="font-semibold text-sm text-foreground">{comment.userName}</span>
                            
                            <div className="flex items-center gap-2 ml-auto">
                              <span className="text-xs text-muted-foreground">
                                {comment.createdAt?.toDate?.()?.toLocaleDateString?.() || 'Just now'}
                              </span>
                              {isCommentOwner && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(comment.id)}
                                  className="text-muted-foreground hover:text-red-500 transition-colors p-0.5 rounded-full hover:bg-red-500/10"
                                  title="Delete comment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-muted-foreground text-sm leading-relaxed">{comment.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Sidebar - Trip Info */}
              <div className="space-y-4">
                <div className="bg-linear-to-br from-rose-50 dark:from-rose-500/10 to-orange-50 dark:to-orange-500/10 border border-rose-200 dark:border-rose-500/20 rounded-2xl p-5 sticky top-4">
                  <h3 className="font-bold text-foreground mb-4 text-base">Trip Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Destination</p>
                        <p className="text-sm font-semibold text-foreground">{story.destination}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Travel Dates</p>
                        <p className="text-sm font-semibold text-foreground">{story.startDate} - {story.endDate}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="text-sm font-semibold text-foreground">{story.duration}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <DollarSign className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Approx Budget</p>
                        <p className="text-sm font-semibold text-foreground">{story.budget?.startsWith('$') ? story.budget.slice(1).trim() : story.budget}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Travel Type</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TRAVEL_TYPE_COLORS[story.travelType]}`}>
                          {story.travelType}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {lightboxIdx !== null && galleryPhotos.length > 0 && (
          <Lightbox photos={galleryPhotos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Submit Story Form
function SubmitStoryForm({
  onClose,
  onSubmit,
  initialData,
  onProgress,
}: {
  onClose: () => void;
  onSubmit: (data: Partial<TripStory>) => Promise<void>;
  initialData?: TripStory;
  onProgress: (progress: number, status: string, done: boolean) => void;
}) {
  const { currentUser, userProfile } = useAuth();
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    authorName: initialData?.authorName ?? userProfile?.displayName ?? currentUser?.displayName ?? currentUser?.email?.split('@')[0] ?? 'User',
    authorEmail: initialData?.authorEmail ?? userProfile?.email ?? currentUser?.email ?? '',
    destination: initialData?.destination ?? '',
    title: initialData?.title ?? '',
    description: initialData?.description || initialData?.fullStory || '',
    fullStory: '',
    tripHighlights: initialData?.tripHighlights ?? '',
    dayByDay: initialData?.dayByDay ?? '',
    bestPlaces: initialData?.bestPlaces ?? '',
    localFood: initialData?.localFood ?? '',
    travelTips: initialData?.travelTips ?? '',
    duration: initialData?.duration ?? '',
    budget: initialData?.budget ?? '',
    travelType: (initialData?.travelType ?? 'Solo') as TripStory['travelType'],
    startDate: initialData?.startDate ?? '',
    endDate: initialData?.endDate ?? '',
  });

  useEffect(() => {
    if (!isEdit) {
      setForm(f => ({
        ...f,
        authorName: f.authorName || userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
        authorEmail: f.authorEmail || userProfile?.email || currentUser?.email || '',
      }));
    }
  }, [userProfile, currentUser, isEdit]);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const twoYearsAgoStr = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().split('T')[0];
  }, []);
  const [videoLinks, setVideoLinks] = useState<string[]>(
    initialData?.videos?.length ? initialData.videos.map(v => v.url) : ['']
  );
  // Existing photos already on Cloudinary (kept unless explicitly removed)
  const [existingPhotos, setExistingPhotos] = useState<StoryPhoto[]>(initialData?.photos ?? []);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeExistingPhoto = (i: number) => {
    setExistingPhotos(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  };

  const addVideoLink = () => setVideoLinks(v => [...v, '']);
  const removeVideoLink = (i: number) => setVideoLinks(v => v.filter((_, idx) => idx !== i));
  const updateVideoLink = (i: number, val: string) => setVideoLinks(v => v.map((x, idx) => idx === i ? val : x));

  // Compress an image File to a max dimension / quality using Canvas
  const compressImage = (file: File, maxDim = 1920, quality = 0.85): Promise<File> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height / width) * maxDim); width = maxDim; }
          else { width = Math.round((width / height) * maxDim); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }) : file);
        }, 'image/webp', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const MAX = 5;
    const files = Array.from(e.target.files || []);
    const remaining = MAX - imageFiles.length;
    if (remaining <= 0) return;
    const accepted = files.slice(0, remaining);
    e.target.value = '';
    setIsCompressing(true);
    // Compress each image before adding to state
    const compressed = await Promise.all(accepted.map(f => compressImage(f)));
    const newPreviews = compressed.map(f => URL.createObjectURL(f));
    setImageFiles(prev => [...prev, ...compressed]);
    setPreviewUrls(prev => [...prev, ...newPreviews]);
    setSubmitError('');
    setIsCompressing(false);
  };

  const removeImage = (i: number) => {
    URL.revokeObjectURL(previewUrls[i]);
    setImageFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviewUrls(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.authorName || !form.destination || !form.title || !form.description) {
      setSubmitError('Please fill in all required fields.');
      return;
    }
    setSubmitError('');
    // Close the modal immediately - upload continues in background
    onClose();
    onProgress(0, 'Preparing upload...', false);
    try {
      const photos: StoryPhoto[] = [];
      const errors: string[] = [];
      const total = imageFiles.length;

      for (let fi = 0; fi < imageFiles.length; fi++) {
        const file = imageFiles[fi];
        onProgress(Math.round((fi / Math.max(total, 1)) * 80), `Uploading photo ${fi + 1} of ${total}...`, false);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', 'trip-stories');
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          photos.push({ url: data.url, publicId: data.key, caption: '' });
        } else {
          const errBody = await res.json().catch(() => ({}));
          console.error(`R2 upload failed for ${file.name}:`, res.status, errBody);
          errors.push(file.name);
        }
        onProgress(Math.round(((fi + 1) / Math.max(total, 1)) * 80), `Uploaded ${fi + 1} of ${total} photos`, false);
        if (fi < imageFiles.length - 1) await Promise.resolve();
      }

      if (total === 0) onProgress(80, 'Saving story...', false);

      const videos = videoLinks.filter(v => v.trim()).map(v => parseVideoEmbed(v));
      const allPhotos: StoryPhoto[] = [...existingPhotos, ...photos];
      const coverImage = allPhotos.length > 0 ? allPhotos[0].url : (initialData?.coverImage ?? '');

      onProgress(90, 'Saving story...', false);

      await onSubmit({
        ...form,
        coverImage,
        photos: allPhotos,
        videos,
        likes: initialData?.likes ?? [],
        commentCount: initialData?.commentCount ?? 0,
      });

      onProgress(
        100,
        errors.length > 0
          ? `Saved! ${photos.length} photo(s) uploaded - ${errors.length} failed`
          : 'Story published!',
        false
      );
      await Promise.resolve();
      onProgress(100, '', true);
    } catch (err: any) {
      console.error('Story submit error:', err);
      onProgress(100, `Error: ${err?.message || 'upload failed'}`, false);
      await Promise.resolve();
      onProgress(100, '', true);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        data-lenis-prevent
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm overflow-y-auto overscroll-contain touch-pan-y py-8 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-2xl"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
        >
          <div className="bg-linear-to-r from-rose-500 to-orange-500 p-6 rounded-t-3xl relative">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white text-xl font-bold">
                  {isEdit ? 'Edit Your Story' : 'Share Your Travel Story'}
                </h2>
                <p className="text-rose-100 text-sm mt-1">
                  {isEdit ? 'Update your story details, add more photos or videos' : 'Inspire fellow travelers with your experience'}
                </p>
              </div>
              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { name: 'authorName', label: 'Your Name *', placeholder: 'John Doe', type: 'text' },
                { name: 'authorEmail', label: 'Email', placeholder: 'you@example.com', type: 'email' },
                { name: 'destination', label: 'Destination *', placeholder: 'Ladakh, India', type: 'text' },
                { name: 'title', label: 'Story Title *', placeholder: 'My Unforgettable Trek...', type: 'text' },
                { name: 'duration', label: 'Trip Duration', placeholder: '7 Days', type: 'text' },
                { name: 'budget', label: 'Approx Budget', placeholder: 'Rs 30,000', type: 'text' },
                { name: 'startDate', label: 'Start Date', placeholder: '', type: 'date' },
                { name: 'endDate', label: 'End Date', placeholder: '', type: 'date' },
              ].map(field => (
                <div key={field.name}>
                  <label className="block text-xs font-semibold text-foreground mb-1">{field.label}</label>
                  <input
                    name={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={(form as any)[field.name]}
                    onChange={handleChange}
                    min={field.type === 'date' ? twoYearsAgoStr : undefined}
                    max={field.type === 'date' ? todayStr : undefined}
                    disabled={field.name === 'authorName' || field.name === 'authorEmail'}
                    className={`w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/40 ${
                      (field.name === 'authorName' || field.name === 'authorEmail')
                        ? 'opacity-60 cursor-not-allowed bg-muted/50'
                        : ''
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Travel Type */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Travel Type</label>
              <select
                name="travelType"
                value={form.travelType}
                onChange={handleChange}
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              >
                {['Solo', 'Couple', 'Family', 'Group'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Description */}
            {[
              { name: 'description', label: 'Short Preview Description / Introduction *', rows: 4, placeholder: 'Tell us everything about your adventure / A brief summary of your trip...' },
              { name: 'tripHighlights', label: 'Trip Highlights', rows: 2, placeholder: 'e.g. Pangong Lake, Nubra Valley...' },
              { name: 'dayByDay', label: 'Day-by-Day Experience', rows: 4, placeholder: 'Day 1: Arrival...\nDay 2: ...' },
              { name: 'localFood', label: 'Local Food Experience', rows: 2, placeholder: 'Local dishes you tried and loved...' },
              { name: 'travelTips', label: 'Travel Tips', rows: 3, placeholder: 'Tips for future travelers...' },
            ].map(field => (
              <div key={field.name}>
                <label className="block text-xs font-semibold text-foreground mb-1">{field.label}</label>
                <textarea
                  name={field.name}
                  rows={field.rows}
                  placeholder={field.placeholder}
                  value={(form as any)[field.name]}
                  onChange={handleChange}
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                />
              </div>
            ))}

            {/* Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">
                Upload Trip Photos
                <span className="ml-2 text-muted-foreground font-normal">
                  ({imageFiles.length}/5 new{existingPhotos.length > 0 ? `, ${existingPhotos.length} existing` : ''})
                </span>
              </label>
              {/* Existing photos in edit mode */}
              {isEdit && existingPhotos.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Current photos (click x to remove):</p>
                  <div className="grid grid-cols-3 gap-2">
                    {existingPhotos.map((photo, i) => (
                      <div key={i} className="relative aspect-square">
                        <img src={photo.url} alt={photo.caption} className="w-full h-full object-cover rounded-xl" />
                        <button
                          type="button"
                          onClick={() => removeExistingPhoto(i)}
                          className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div
                className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
                  isCompressing || imageFiles.length >= 5
                    ? 'border-border/30 opacity-50 cursor-not-allowed'
                    : 'border-border cursor-pointer hover:border-rose-500/50'
                }`}
                onClick={() => !isCompressing && imageFiles.length < 5 && fileInputRef.current?.click()}
              >
                {isCompressing ? (
                  <>
                    <div className="w-8 h-8 mx-auto mb-2 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Compressing photos...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {imageFiles.length >= 5 ? 'Maximum 5 photos reached' : `Click to upload photos (${5 - imageFiles.length} remaining)`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Any size - auto-compressed before upload</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              {previewUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={url} alt="" className="w-full h-full object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Links */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-2">Social Media Video Links (YouTube / Facebook / Instagram)</label>
              <div className="space-y-2">
                {videoLinks.map((link, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <div className="flex items-center gap-1 px-2">
                      <PlatformIcon platform={parseVideoEmbed(link).platform} />
                    </div>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={link}
                      onChange={e => updateVideoLink(i, e.target.value)}
                      className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    />
                    {videoLinks.length > 1 && (
                      <button type="button" onClick={() => removeVideoLink(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addVideoLink}
                  className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-400 transition-colors mt-1"
                >
                  <Plus className="w-4 h-4" /> Add Another Video Link
                </button>
              </div>
            </div>

            {submitError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
                {submitError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-linear-to-r from-rose-500 to-orange-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {isEdit ? (
                  <><Pencil className="w-4 h-4" /> Save Changes</>
                ) : (
                  <><Send className="w-4 h-4" /> Submit Story</>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// -------------------------- Main Page ------------------------

export default function TripStoriesPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const uid = currentUser?.uid || null;
  const userEmail = currentUser?.email || null;

  const [stories, setStories] = useState<TripStory[]>(SAMPLE_STORIES);
  const [filteredStories, setFilteredStories] = useState<TripStory[]>(SAMPLE_STORIES);
  const [selectedStory, setSelectedStory] = useState<TripStory | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [editingStory, setEditingStory] = useState<TripStory | null>(null);
  const [globalUploadProgress, setGlobalUploadProgress] = useState(0);
  const [globalUploadStatus, setGlobalUploadStatus] = useState('');
  const [globalUploading, setGlobalUploading] = useState(false);

  const handleUploadProgress = useCallback((progress: number, status: string, done: boolean) => {
    if (done) {
      setGlobalUploading(false);
      setGlobalUploadProgress(0);
      setGlobalUploadStatus('');
    } else {
      setGlobalUploading(true);
      setGlobalUploadProgress(progress);
      setGlobalUploadStatus(status);
    }
  }, []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [filterDuration, setFilterDuration] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const searchParams = useSearchParams();
  const handledStoryParamRef = useRef(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Load stories from Firestore (merged with sample)
  useEffect(() => {
    const q = query(collection(firestoreDb, 'stories'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      const firestoreStories = snap.docs.map(d => ({ ...(d.data() as TripStory), id: d.id }));
      setStories([...firestoreStories, ...SAMPLE_STORIES]);
    }, () => {
      // Firestore unavailable, use samples
      setStories(SAMPLE_STORIES);
    });
    return unsub;
  }, []);

  // Auto-open story from query parameter (?story=...)
  useEffect(() => {
    if (handledStoryParamRef.current) return;
    const storyId = searchParams.get('story');
    if (!storyId) return;

    const matchedStory = stories.find(s => s.id === storyId);
    if (matchedStory) {
      setSelectedStory(matchedStory);
      handledStoryParamRef.current = true;
    }
  }, [stories, searchParams]);

  // Apply filters
  useEffect(() => {
    let result = [...stories];
    const q = searchQuery.toLowerCase();
    if (q) result = result.filter(s => s.title.toLowerCase().includes(q) || s.destination.toLowerCase().includes(q) || s.authorName.toLowerCase().includes(q));
    if (filterDestination) result = result.filter(s => s.destination.toLowerCase().includes(filterDestination.toLowerCase()));
    if (filterType) result = result.filter(s => s.travelType === filterType);
    if (filterDuration) result = result.filter(s => {
      const days = parseInt(s.duration);
      if (filterDuration === 'short') return days <= 3;
      if (filterDuration === 'medium') return days >= 4 && days <= 7;
      if (filterDuration === 'long') return days > 7;
      return true;
    });
    setFilteredStories(result);
  }, [stories, searchQuery, filterDestination, filterType, filterDuration]);

  const handleLike = useCallback(async (storyId: string) => {
    if (!uid) return;
    const storyIdx = stories.findIndex(s => s.id === storyId);
    if (storyIdx === -1) return;

    const story = stories[storyIdx];
    const isLiked = story.likes.includes(uid);
    const newLikes = isLiked ? story.likes.filter(id => id !== uid) : [...story.likes, uid];

    // Optimistic update
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, likes: newLikes } : s));
    if (selectedStory?.id === storyId) setSelectedStory(prev => prev ? { ...prev, likes: newLikes } : null);

    // Persist to Firestore (only for real stories, not samples)
    if (!storyId.startsWith('sample-')) {
      try {
        const storyRef = doc(firestoreDb, 'stories', storyId);
        await updateDoc(storyRef, { likes: isLiked ? arrayRemove(uid) : arrayUnion(uid) });
      } catch { /* ignore */ }
    }
  }, [stories, uid, selectedStory]);

  const handleDeleteStory = useCallback(async (storyId: string) => {
    setStories(prev => prev.filter(s => s.id !== storyId));
    if (!storyId.startsWith('sample-')) {
      const response = await fetch(`/api/trip-stories?id=${storyId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.error('Failed to delete story from server');
      }
    }
  }, []);

  const handleEditStory = async (data: Partial<TripStory>) => {
    if (!editingStory) return;
    const storyId = editingStory.id;
    const updated = { ...editingStory, ...data } as TripStory;
    // Optimistic update
    setStories(prev => prev.map(s => s.id === storyId ? updated : s));
    if (selectedStory?.id === storyId) setSelectedStory(updated);
    if (!storyId.startsWith('sample-')) {
      const response = await fetch(`/api/trip-stories?id=${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          destination: data.destination,
          description: data.description,
          fullStory: data.fullStory ?? '',
          tripHighlights: data.tripHighlights ?? '',
          dayByDay: data.dayByDay ?? '',
          bestPlaces: data.bestPlaces ?? '',
          localFood: data.localFood ?? '',
          travelTips: data.travelTips ?? '',
          duration: data.duration,
          budget: data.budget,
          travelType: data.travelType,
          startDate: data.startDate,
          endDate: data.endDate,
          coverImage: data.coverImage,
          photos: data.photos,
          videos: data.videos,
        }),
      });
      if (!response.ok) {
        console.error('Failed to update story on server');
      }
    }
    setEditingStory(null);
  };

  const handleSubmitStory = async (data: Partial<TripStory>) => {
    const response = await fetch('/api/trip-stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      ...data,
      authorId: uid ?? '',
      authorEmail: userEmail ?? data.authorEmail ?? '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || 'Failed to submit story.');
    }
    const created = payload?.data || {};
    // optimistically add
    setStories(prev => [{
      ...data,
      id: created.id,
      authorId: uid ?? '',
      authorEmail: userEmail ?? data.authorEmail ?? '',
      createdAt: { toDate: () => new Date(created.createdAt || Date.now()) },
    } as TripStory, ...prev]);
  };

  const featured = useMemo(() => {
    if (stories.length === 0) return null;
    return stories.reduce((best, current) => {
      const bestLikes = best.likes?.length || 0;
      const currentLikes = current.likes?.length || 0;
      if (currentLikes > bestLikes) return current;
      if (currentLikes === bestLikes) {
        const bestTime = best.createdAt?.toDate ? best.createdAt.toDate().getTime() : (best.createdAt ? new Date(best.createdAt).getTime() : 0);
        const currentTime = current.createdAt?.toDate ? current.createdAt.toDate().getTime() : (current.createdAt ? new Date(current.createdAt).getTime() : 0);
        return currentTime > bestTime ? current : best;
      }
      return best;
    });
  }, [stories]);

  const gridStories = filteredStories;

  return (
    <div className="min-h-screen bg-linear-to-br from-rose-200 to-gray-200 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
      {/* Header */}
      <Header1 />
      <CommunityHeader />

      {/* Hero Section */}
      <section ref={heroRef} className="relative pt-16 h-[85vh] min-h-137.5 flex items-center justify-center overflow-hidden">

        {/* Background image - both modes */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1600&q=80"
            alt="Travel hero"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/40 to-black/30" />
        </div>

        {/* Bottom page blend */}
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-linear-to-t from-background via-background/55 to-transparent pointer-events-none" />

        {/* Floating particles */}
        {[...Array(60)].map((_, i) => (
          <motion.div
            key={`p-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${1.5 + (i % 4)}px`,
              height: `${1.5 + (i % 4)}px`,
              left: `${(i * 1.61 + 1) % 96}%`,
              top: `${(i * 2.73 + 3) % 88}%`,
              background: i % 5 === 0 ? 'rgba(255,180,180,0.7)'
                : i % 5 === 1 ? 'rgba(255,200,120,0.65)'
                : i % 5 === 2 ? 'rgba(255,160,200,0.65)'
                : i % 5 === 3 ? 'rgba(255,255,255,0.55)'
                : 'rgba(220,200,255,0.6)',
            }}
            animate={{
              y: [0, -(18 + (i % 20)), 0],
              x: [0, (i % 2 === 0 ? 8 : -8) + (i % 4) - 2, 0],
              opacity: [0.1, 0.65, 0.1],
              scale: [1, 1.5, 1],
            }}
            transition={{ duration: 4 + (i % 6), repeat: Infinity, delay: (i * 0.14) % 5, ease: 'easeInOut' }}
          />
        ))}

        {/* Hero copy */}
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
              Real Travel Experiences
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white mb-5 leading-tight">
              Travel <span className="bg-linear-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">Stories</span>
            </h1>
            <p className="text-gray-300 text-lg md:text-xl mb-10 max-w-2xl mx-auto">
              Real travel experiences from our travelers discover, explore & get inspired for your next adventure
            </p>

            {/* Search bar */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
              <div className="flex-1 flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-4 py-3">
                <Search className="w-5 h-5 text-white/60 shrink-0" />
                <input
                  type="text"
                  placeholder="Search stories, destinations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-white placeholder:text-white/50 focus:outline-none text-sm"
                />
              </div>
              <motion.button
                onClick={() => heroRef.current?.nextElementSibling?.scrollIntoView({ behavior: 'smooth' })}
                className="px-6 py-3 bg-linear-to-r from-rose-500 to-orange-500 text-white font-semibold rounded-2xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-rose-500/25"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Explore Stories
              </motion.button>
            </div>

            {/* Share Story button */}
            <motion.button
              onClick={() => {
                if (!currentUser) {
                  router.push('/auth');
                } else {
                  setShowSubmitForm(true);
                }
              }}
              className="mt-5 flex items-center gap-2 mx-auto px-7 py-3 bg-linear-to-r from-rose-500 to-orange-500 text-white text-sm font-semibold rounded-2xl hover:opacity-90 transition-opacity shadow-lg shadow-rose-500/25"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4" />
              Share Your Story
            </motion.button>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        >
          <ChevronDown className="w-6 h-6 text-white/60" />
        </motion.div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Featured Story */}
        {featured && (
          <section className="mb-14">
            <FeaturedStoryCard
              story={featured}
              onOpen={setSelectedStory}
              currentUserId={uid}
              onLike={handleLike}
            />
          </section>
        )}

        {/* Filters */}
        <section className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-foreground font-semibold text-sm">Filter Stories:</span>
            <button
              onClick={() => setShowFilters(f => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted border border-border rounded-xl hover:bg-accent transition-colors text-foreground"
            >
              <Search className="w-3.5 h-3.5" /> {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(filterDestination || filterType || filterDuration) && (
              <button
                onClick={() => { setFilterDestination(''); setFilterType(''); setFilterDuration(''); }}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear Filters
              </button>
            )}
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/50 rounded-2xl p-4 border border-border mb-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Destination</label>
                    <input
                      type="text"
                      placeholder="e.g. Kerala"
                      value={filterDestination}
                      onChange={e => setFilterDestination(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Travel Type</label>
                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">All Types</option>
                      {['Solo', 'Couple', 'Family', 'Group'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Duration</label>
                    <select
                      value={filterDuration}
                      onChange={e => setFilterDuration(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    >
                      <option value="">Any Duration</option>
                      <option value="short">Short (1-3 days)</option>
                      <option value="medium">Medium (4-7 days)</option>
                      <option value="long">Long (8+ days)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Search</label>
                    <input
                      type="text"
                      placeholder="Keyword..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing <span className="text-foreground font-semibold">{gridStories.length}</span> stories
            </p>
          </div>
        </section>

        {/* Story Cards Grid */}
        <section className="mb-14">
          {gridStories.length === 0 ? (
            <div className="text-center py-20">
              <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No stories found. Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {gridStories.map((story, i) => (
                <motion.div
                  key={story.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="h-full flex flex-col"
                >
                  <StoryCard
                    story={story}
                    onOpen={setSelectedStory}
                    currentUserId={uid}
                    onLike={handleLike}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Share Your Story CTA */}
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-r from-rose-500 via-orange-500 to-amber-500 p-8 md:p-12 text-center mb-14">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="relative z-10">
            <h2 className="text-white text-3xl md:text-4xl font-black mb-3">Have a Travel Story to Share?</h2>
            <p className="text-rose-100 text-lg mb-6 max-w-xl mx-auto">Inspire thousands of fellow travelers with your experience. Share your journey with the ABjee Travel community.</p>
            <motion.button
              onClick={() => {
                if (!currentUser) {
                  router.push('/auth');
                } else {
                  setShowSubmitForm(true);
                }
              }}
              className="px-8 py-3.5 bg-white text-rose-600 font-bold rounded-2xl hover:bg-rose-50 transition-colors shadow-xl text-sm"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Share Your Story
            </motion.button>
          </div>
        </section>
      </main>

      {/* Story Detail Modal */}
      <AnimatePresence>
        {selectedStory && (
          <StoryModal
            story={selectedStory}
            onClose={() => setSelectedStory(null)}
            currentUserId={uid}
            currentUserEmail={userEmail}
            onLike={handleLike}
            onDelete={handleDeleteStory}
            onEdit={(story) => { setEditingStory(story); }}
          />
        )}
      </AnimatePresence>

      {/* Related Stories inside modal (appended to modal via portal approach is complex - shown inline) */}
      {/* Edit Story Form */}
      <AnimatePresence>
        {editingStory && (
          <SubmitStoryForm
            onClose={() => setEditingStory(null)}
            onSubmit={handleEditStory}
            initialData={editingStory}
            onProgress={handleUploadProgress}
          />
        )}
      </AnimatePresence>

      {/* Submit Form Modal */}
      <AnimatePresence>
        {showSubmitForm && (
          <SubmitStoryForm
            onClose={() => setShowSubmitForm(false)}
            onSubmit={handleSubmitStory}
            onProgress={handleUploadProgress}
          />
        )}
      </AnimatePresence>

      {/* Global floating upload progress toast (Facebook-style) */}
      {globalUploading && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-300 w-80 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-4 pt-3 pb-1 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              globalUploadStatus.startsWith('Error') ? 'bg-red-500' : 'bg-linear-to-br from-rose-500 to-orange-500'
            }`}>
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {globalUploadProgress === 100
                  ? (globalUploadStatus.startsWith('Error') ? 'Upload failed' : 'Story Published!')
                  : 'Publishing your story...'}
              </p>
              <p className={`text-xs truncate ${globalUploadStatus.startsWith('Error') || globalUploadStatus.includes('failed') ? 'text-red-500' : 'text-muted-foreground'}`}>
                {globalUploadStatus}
              </p>
            </div>
            {globalUploadProgress === 100 && (
              globalUploadStatus.startsWith('Error')
                ? <X className="w-5 h-5 text-red-500 shrink-0" />
                : <Check className="w-5 h-5 text-green-500 shrink-0" />
            )}
          </div>
          {/* Progress bar */}
          <div className="mx-4 mb-3 mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                globalUploadStatus.startsWith('Error') ? 'bg-red-500'
                  : globalUploadProgress === 100 ? 'bg-green-500'
                  : 'bg-linear-to-r from-rose-500 to-orange-500'
              }`}
              initial={{ width: '0%' }}
              animate={{ width: `${globalUploadProgress}%` }}
              transition={{ ease: 'easeOut', duration: 0.4 }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center">
        <p className="text-muted-foreground text-sm">
          (c) {new Date().getFullYear()} ABjee Travel - All travel stories are shared by community members
        </p>
      </footer>
    </div>
  );
}
