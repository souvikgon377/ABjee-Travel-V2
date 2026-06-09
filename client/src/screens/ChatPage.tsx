import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, MessageCircle, Users, Clock, Share2, Trash2, Copy, Lock, Crown, Shield, Compass, Eye, Calendar, Search, PauseCircle, PlayCircle, X, Upload, Image as ImageIcon, MapPin, Video, Play, ChevronLeft, ChevronRight, Star, Facebook, Instagram, AlertCircle } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, limit, getDocs, where } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { resolveAvatarUrl } from '@/lib/avatar';
import type { TouristPlace, MediaItem } from '@/components/ui/tourist-places';
import { motion, AnimatePresence } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';
import { useIsMobile } from '@/hooks/use-mobile';
import { chatService } from '@/lib/chatService';
import { type ChatRoom as ChatRoomType } from '@/lib/chatService';
import { uploadImageToR2, createImagePreview, revokeImagePreview, type ImageUploadResult } from '@/lib/r2Upload';
import { publicAsset } from '@/lib/publicAsset';
import { useAuth } from '@/contexts/AuthContext';
import { subscriptionsAPI, placesAPI } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import {
  getSubscriptionInfo,
  getPrivateRoomCreateAllowance,
  hasPaidAccess,
} from '@/lib/subscriptionPolicy';
import { modernConfirm } from '@/lib/modernDialog';
import { sanitizeRichTextHtmlForDisplay } from '@/lib/richTextDisplay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Header from '@/components/mvpblocks/header-1';
import Footer4Col from '@/components/mvpblocks/footer-4col';
import OfferSpotlightPopup from '@/components/ui/offer-spotlight-popup';
import { BlurInText } from '@/components/ui/blur-in-text';


async function uploadVideoToR2(file: File): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', 'tourist-places/user-videos');

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: fd
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error ?? 'Video upload failed');
  }

  const data = await res.json() as { url: string; key: string };
  return { url: data.url, key: data.key };
}

type PlaceReview = {
  id: string;
  text: string;
  author: string;
  userId: string;
  avatarUrl?: string;
  rating: number;
  createdAt: unknown;
  media: MediaItem[];
};

type ReviewComment = {
  id: string;
  text: string;
  author: string;
  userId: string;
  avatarUrl?: string;
  createdAt: unknown;
};

type CountryUserHighlight = {
  id: string;
  name: string;
  username: string;
  country: string;
  profilePictureUrl?: string;
  avatarUrl?: string;
};

type CommunityOwnerProfile = {
  displayName: string;
  avatarUrl: string;
};

type LiveOffer = {
  id: string;
  title: string;
  description: string;
  badge?: string;
  ctaText?: string;
  ctaHref?: string;
  isActive?: boolean;
  priority?: number;
};

const STATIC_VIDEO_V1 = publicAsset('/v1.mp4');
const STATIC_VIDEO_V2 = publicAsset('/v2.mp4');
const STATIC_VIDEO_V3 = publicAsset('/v3.mp4');
const STATIC_VIDEO_V4 = publicAsset('/v4.mp4');
const PENDING_PRIVATE_JOIN_ROOMS_KEY = 'abjee:pending-private-join-rooms';

const getCountryFromUserData = (data: Record<string, unknown>): string => {
  const candidate = [
    data.country,
    data.nationality,
    data.currentCountry,
  ].find((item): item is string => typeof item === 'string' && item.trim().length > 0);

  return candidate ? candidate.trim() : '';
};



// -- PlaceCard: video-first or draggable-image carousel card ------------------
const PlaceCard: React.FC<{
  place: TouristPlace;
  idx: number;
  onSelect: () => void;
  reducedMotion?: boolean;
  disableVideoAutoplay?: boolean;
}> = ({ place, idx, onSelect, reducedMotion = false, disableVideoAutoplay = false }) => {
  const videos = place.media?.filter(m => m.type === 'video') ?? [];
  const images = place.media?.filter(m => m.type === 'image') ?? [];
  const hasVideo = videos.length > 0;
  const hasImages = images.length > 0;

  const [imgIdx, setImgIdx] = useState(0);
  const [vidPaused, setVidPaused] = useState(false);
  const [cardShareMessage, setCardShareMessage] = useState('');
  const dragRef = useRef(false);
  const cardVideoRef = useRef<HTMLVideoElement>(null);

  // Auto-advance images when no video
  useEffect(() => {
    if (hasVideo || images.length <= 1) return;
    const t = setInterval(() => setImgIdx(i => (i + 1) % images.length), 3500);
    return () => clearInterval(t);
  }, [hasVideo, images.length]);

  const toggleVid = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = cardVideoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setVidPaused(false); }
    else { v.pause(); setVidPaused(true); }
  };

  const goPrev = (e: React.MouseEvent) => { e.stopPropagation(); setImgIdx(i => (i - 1 + images.length) % images.length); };
  const goNext = (e: React.MouseEvent) => { e.stopPropagation(); setImgIdx(i => (i + 1) % images.length); };

  const sharePlaceFromCard = (
    platform: 'facebook' | 'instagram' | 'whatsapp',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    const placeLocation = [place.area, place.state, place.country]
      .filter(Boolean)
      .join(', ');
    // Share the in-app travel destination page so links open within ABjee Travel
    const targetUrl = `${window.location.origin}/travel-destinations?place=${encodeURIComponent(
      String(place.name || '')
    )}${place.coverImage ? `&img=${encodeURIComponent(String(place.coverImage))}` : ''}`;
    const shareText = `Check out ${place.name}${placeLocation ? ` (${placeLocation})` : ''} on ABjee Travel. ${targetUrl}`;

    if (platform === 'facebook') {
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}&quote=${encodeURIComponent(shareText)}`;
      window.open(fbUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (platform === 'whatsapp') {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    void navigator.clipboard
      .writeText(shareText)
      .then(() => setCardShareMessage('Copied for Instagram'))
      .catch(() => setCardShareMessage('Copy failed for Instagram'));
    setTimeout(() => setCardShareMessage(''), 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reducedMotion ? { duration: 0.2 } : { delay: 0.04 * idx, type: 'spring', stiffness: 260, damping: 24 }}
      whileHover={reducedMotion ? undefined : { y: -8, scale: 1.03 }}
      onClick={onSelect}
      className="cursor-pointer rounded-2xl overflow-hidden bg-white/10 backdrop-blur-md border border-white/15 shadow-xl hover:shadow-2xl hover:shadow-black/40 hover:border-white/30 transition-all duration-300 group relative"
    >
      {/* Shimmer on hover */}
      {!reducedMotion && (
        <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <motion.div
            className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent skew-x-12"
            animate={{ x: ['-150%', '250%'] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1, ease: 'linear' }}
          />
        </div>
      )}

      {/* Media */}
      <div className="relative h-44 overflow-hidden">
        {hasVideo ? (
          /* Autoplaying video with pause/resume */
          <>
            <video
              ref={cardVideoRef}
              src={videos[0].url}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              autoPlay={!disableVideoAutoplay}
              muted
              loop
              playsInline
              controls={!disableVideoAutoplay}
              preload="metadata"
              onPlay={() => setVidPaused(false)}
              onPause={() => setVidPaused(true)}
            />
            {/* pause / resume button */}
            <motion.button
              whileHover={reducedMotion ? undefined : { scale: 1.12 }}
              whileTap={reducedMotion ? undefined : { scale: 0.9 }}
              animate={reducedMotion ? undefined : (vidPaused ? { scale: 1 } : { scale: [1, 1.08, 1] })}
              transition={reducedMotion ? undefined : (vidPaused ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' })}
              onClick={toggleVid}
              className="absolute bottom-2.5 right-2.5 z-20 h-9 w-9 rounded-full bg-linear-to-br from-black/70 to-rose-700/55 hover:from-black/80 hover:to-rose-600/70 backdrop-blur-md border border-white/35 flex items-center justify-center text-white shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-colors"
            >
              {vidPaused
                ? <Play className="h-3.5 w-3.5 ml-0.5" />
                : <PauseCircle className="h-4 w-4" />}
            </motion.button>
            <span className="absolute top-2 left-2 z-20 text-[9px] font-bold bg-rose-600/90 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow backdrop-blur-sm pointer-events-none">
              <Video className="h-2.5 w-2.5" /> VIDEO
            </span>
          </>
        ) : hasImages ? (
          /* Draggable image carousel */
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={imgIdx}
                src={images[imgIdx].url}
                alt={images[imgIdx].caption ?? place.name}
                className="absolute inset-0 w-full h-full object-cover select-none"
                initial={{ opacity: 0, x: 55 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -55 }}
                transition={{ duration: 0.32, ease: 'easeInOut' }}
                drag={images.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragStart={() => { dragRef.current = false; }}
                onDragEnd={(_, info) => {
                  if (images.length > 1) {
                    if (info.offset.x < -40) setImgIdx(i => (i + 1) % images.length);
                    else if (info.offset.x > 40) setImgIdx(i => (i - 1 + images.length) % images.length);
                  }
                  if (Math.abs(info.offset.x) > 10) {
                    dragRef.current = true;
                    setTimeout(() => { dragRef.current = false; }, 80);
                  }
                }}
                onClick={(e) => { if (dragRef.current) e.stopPropagation(); }}
                loading="lazy"
                draggable={false}
              />
            </AnimatePresence>
            {images.length > 1 && (
              <>
                <button onClick={goPrev} className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-black/45 hover:bg-black/75 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button onClick={goNext} className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-black/45 hover:bg-black/75 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20 pointer-events-none">
                  {images.map((_, i) => (
                    <div key={i} className={`rounded-full transition-all duration-300 ${i === imgIdx ? 'w-3 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : place.coverImage ? (
          /* Cover image fallback */
          <img src={place.coverImage} alt={place.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" draggable={false} />
        ) : (
          /* Empty state */
          <div className="w-full h-full bg-linear-to-br from-rose-600 to-pink-700 flex items-center justify-center">
            <Compass className="h-14 w-14 text-white/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
        <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-1.5">
          <span className="text-[10px] font-bold bg-linear-to-r from-rose-600 to-pink-600 text-white px-2.5 py-1 rounded-full shadow-lg backdrop-blur-sm border border-white/20 pointer-events-none">
            {place.category}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => void sharePlaceFromCard('facebook', e)}
              title="Share on Facebook"
              className="h-7 w-7 rounded-full bg-black/55 hover:bg-blue-600/80 border border-white/30 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
            >
              <Facebook className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => void sharePlaceFromCard('instagram', e)}
              title="Share on Instagram"
              className="h-7 w-7 rounded-full bg-black/55 hover:bg-pink-600/80 border border-white/30 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
            >
              <Instagram className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => void sharePlaceFromCard('whatsapp', e)}
              title="Share on WhatsApp"
              className="h-7 w-7 rounded-full bg-black/55 hover:bg-emerald-600/80 border border-white/30 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
          {cardShareMessage && (
            <span className="rounded-md bg-black/70 px-2 py-1 text-[10px] text-white/90 shadow-lg backdrop-blur-sm">
              {cardShareMessage}
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-bold text-white text-base leading-tight mb-1.5 group-hover:text-rose-300 transition-colors duration-300 line-clamp-1">
          {place.name}
        </h3>
        <div className="flex items-center gap-1 text-white/65 text-xs mb-2">
          <MapPin className="h-3 w-3 shrink-0 text-rose-400" />
          <span className="line-clamp-1">{[place.area, place.state, place.country].filter(Boolean).join(', ')}</span>
        </div>
        {place.description && (
          <p className="text-white/55 text-xs line-clamp-2 leading-relaxed">{place.description}</p>
        )}
        <div className="flex items-center gap-3 mt-3 text-white/45 text-xs">
          {images.length > 0 && (
            <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />{images.length}</span>
          )}
          {videos.length > 0 && (
            <span className="flex items-center gap-1"><Video className="h-3 w-3" />{videos.length}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

/**
 * Chat Communities List Component
 */
const ChatRoomsList: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, userProfile } = useAuth();
  const isMobile = useIsMobile();

  const [rooms, setRooms] = useState<ChatRoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [_newRoomPassword, setNewRoomPassword] = useState('');
  const [newRoomIsPublic, setNewRoomIsPublic] = useState(false); // New state for public/private
  const [newPrivateVisibility, setNewPrivateVisibility] = useState<'exposed' | 'private'>('private');
  const [creating, setCreating] = useState(false);
  const [createRoomError, setCreateRoomError] = useState('');

  // Image upload states
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string>('');
  const [iconImageFile, setIconImageFile] = useState<File | null>(null);
  const [iconImagePreview, setIconImagePreview] = useState<string>('');
  const [uploadingImages, setUploadingImages] = useState(false);

  // Filter rooms into public and private
  const publicRooms = useMemo(() => rooms.filter(room => room.isPublic), [rooms]);
  const privateRooms = useMemo(() => rooms.filter(room => !room.isPublic), [rooms]);
  const myPrivateRooms = useMemo(
    () => privateRooms.filter((room) => room.createdBy === user?.uid),
    [privateRooms, user?.uid]
  );
  const friendsPrivateRooms = useMemo(
    () => privateRooms.filter((room) => room.createdBy !== user?.uid),
    [privateRooms, user?.uid]
  );

  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareRoom, setShareRoom] = useState<ChatRoomType | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [socialShareMessage, setSocialShareMessage] = useState('');
  const [joinRequestingRoomIds, setJoinRequestingRoomIds] = useState<Set<string>>(new Set());
  const [_userCreatedRoomsCount, setUserCreatedRoomsCount] = useState(0);
  const [userCreatedPrivateRoomsCount, setUserCreatedPrivateRoomsCount] = useState(0);
  const [privateRoomLimitSettings, setPrivateRoomLimitSettings] = useState<{ pro: number; premium: number }>({ pro: 3, premium: 10 });
  const [privateCommunitySearch, setPrivateCommunitySearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchDestination, setSearchDestination] = useState('');
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);
  const featureCardHeightClass = isMobile
    ? 'h-[12rem] sm:h-[20rem] md:h-[22rem] lg:h-[24rem]'
    : 'h-[18rem] sm:h-[20rem] md:h-[22rem] lg:h-[24rem]';
  const debouncedSearchDestination = useDebounce(searchDestination, 300);
  const normalizedSearchDestination = useMemo(
    () => debouncedSearchDestination.trim().toLowerCase(),
    [debouncedSearchDestination]
  );
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const subscriptionInfo = useMemo(() => getSubscriptionInfo(userProfile), [userProfile]);
  const paidMember = useMemo(() => hasPaidAccess(subscriptionInfo), [subscriptionInfo]);
  const privateRoomAllowance = useMemo(
    () => getPrivateRoomCreateAllowance(userProfile, userCreatedPrivateRoomsCount, privateRoomLimitSettings),
    [userProfile, userCreatedPrivateRoomsCount, privateRoomLimitSettings]
  );
  const isAdminOrOwner = useMemo(() => {
    const role = typeof userProfile?.role === 'string' ? userProfile.role.toLowerCase() : '';
    return role === 'admin' || role === 'owner';
  }, [userProfile?.role]);
  const canCreatePrivateCommunity = useMemo(() => {
    return isAdminOrOwner || paidMember;
  }, [isAdminOrOwner, paidMember]);
  const hasSearchQuery = normalizedSearchDestination.length > 0;

  const handleLoadMore = useCallback(() => {
    if (!searchLoading && searchHasMore) {
      setSearchPage(prev => prev + 1);
    }
  }, [searchLoading, searchHasMore]);
  const shouldOpenExploreInterest = searchParams.get('view') === 'explore-interest';
  const shouldAutoplayRichMedia = !mobilePerformanceMode;
  const normalizedPrivateCommunitySearch = useMemo(
    () => privateCommunitySearch.trim().toLowerCase(),
    [privateCommunitySearch]
  );
  const filterPrivateCommunityRooms = useCallback(
    (roomsList: ChatRoomType[]) => {
      if (!normalizedPrivateCommunitySearch) return roomsList;
      return roomsList.filter((room) => {
        const searchableText = [
          room.name,
          room.description,
          room.visibility === 'exposed' ? 'exposed' : 'private',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(normalizedPrivateCommunitySearch);
      });
    },
    [normalizedPrivateCommunitySearch]
  );

  // Firestore tourist places
  const [firestorePlaces, setFirestorePlaces] = useState<TouristPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<TouristPlace | null>(null);
  const [_selectedPlaceMediaIdx, setSelectedPlaceMediaIdx] = useState(0);
  const [detailVidIdx, setDetailVidIdx] = useState(0);
  const [detailVidPaused, setDetailVidPaused] = useState(false);
  const [detailBannerImgIdx, setDetailBannerImgIdx] = useState(0);
  const detailBannerDragRef = useRef(false);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const detailBannerVidRef = useRef<HTMLVideoElement>(null);

  // Media comments state
  const [mediaComments, setMediaComments] = useState<Record<string, { id: string; text: string; author: string; userId: string; createdAt: unknown }[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [openCommentKey, setOpenCommentKey] = useState<string | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [placeReviews, setPlaceReviews] = useState<Record<string, PlaceReview[]>>({});
  const [reviewInput, setReviewInput] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewComments, setReviewComments] = useState<Record<string, ReviewComment[]>>({});
  const [reviewCommentInputs, setReviewCommentInputs] = useState<Record<string, string>>({});
  const [openReviewCommentReviewId, setOpenReviewCommentReviewId] = useState<string | null>(null);
  const [reviewCommentSubmitting, setReviewCommentSubmitting] = useState(false);
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});
  const [communityOwnerMap, setCommunityOwnerMap] = useState<Record<string, CommunityOwnerProfile>>({});
  const [countryUsers, setCountryUsers] = useState<CountryUserHighlight[]>([]);
  const [userMediaFiles, setUserMediaFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [userMediaUploading, setUserMediaUploading] = useState(false);
  const [userMediaError, setUserMediaError] = useState('');
  const [selectedPlaceShareMessage, setSelectedPlaceShareMessage] = useState('');
  const currentUserAvatar = useMemo(
    () => resolveAvatarUrl(userProfile, user),
    [user, userProfile]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: {
        effectiveType?: string;
        saveData?: boolean;
        addEventListener?: (type: 'change', listener: () => void) => void;
        removeEventListener?: (type: 'change', listener: () => void) => void;
      };
    };

    const updatePerformanceMode = () => {
      const saveData = Boolean(nav.connection?.saveData);
      const networkType = nav.connection?.effectiveType ?? '';
      const constrainedNetwork = networkType === '2g' || networkType === '3g' || networkType === 'slow-2g';

      // Keep rich mobile animations enabled on good networks; throttle only when
      // the user explicitly enables data saver or the connection is constrained.
      setMobilePerformanceMode(mediaQuery.matches && (saveData || constrainedNetwork));
    };

    updatePerformanceMode();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePerformanceMode);
    } else {
      mediaQuery.addListener(updatePerformanceMode);
    }

    nav.connection?.addEventListener?.('change', updatePerformanceMode);

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updatePerformanceMode);
      } else {
        mediaQuery.removeListener(updatePerformanceMode);
      }

      nav.connection?.removeEventListener?.('change', updatePerformanceMode);
    };
  }, [isMobile]);
  useEffect(() => {
    const loadPrivateRoomLimits = async () => {
      try {
        const response = await subscriptionsAPI.getPlans();
        const plans = response?.data?.data?.plans;
        const parsedPro = Number(plans?.pro?.features?.maxPrivateChats);
        const parsedPremium = Number(plans?.premium?.features?.maxPrivateChats);

        setPrivateRoomLimitSettings({
          pro: Number.isFinite(parsedPro) && parsedPro >= 0 ? Math.floor(parsedPro) : 3,
          premium: Number.isFinite(parsedPremium) && parsedPremium >= 0 ? Math.floor(parsedPremium) : 10,
        });
      } catch {
        setPrivateRoomLimitSettings({ pro: 3, premium: 10 });
      }
    };

    loadPrivateRoomLimits();
  }, []);

  const countryUsersCarousel = countryUsers.length > 0 && !isMobile ? (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="overflow-hidden rounded-3xl border border-cyan-200/60 dark:border-cyan-800/40 bg-linear-to-r from-cyan-100/70 via-white/70 to-blue-100/70 dark:from-cyan-950/45 dark:via-slate-900/55 dark:to-blue-950/45 backdrop-blur-xl shadow-[0_18px_50px_-20px_rgba(14,116,144,0.55)]"
    >
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2.5 rounded-2xl bg-linear-to-br from-cyan-500 to-blue-600 shadow-lg"
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Users className="h-5 w-5 text-white" />
          </motion.div>
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-linear-to-r from-cyan-700 via-sky-600 to-blue-600 bg-clip-text text-transparent">
              Travelers From Different Countries
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Live user highlights pulled from database profiles
            </p>
          </div>
        </div>

        <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-cyan-300/70 dark:border-cyan-700/60 bg-white/65 dark:bg-slate-900/65 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
          Live carousel
        </div>
      </div>

      <div className="relative overflow-hidden rounded-b-3xl border-t border-cyan-200/70 dark:border-cyan-800/45 bg-linear-to-b from-cyan-100/30 via-white/70 to-cyan-100/55 dark:from-cyan-950/20 dark:via-slate-900/70 dark:to-blue-950/35 px-4 sm:px-5 pt-3 pb-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-linear-to-r from-cyan-100/95 via-white/90 to-transparent dark:from-slate-900 dark:via-slate-900/90" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-linear-to-l from-cyan-100/95 via-white/90 to-transparent dark:from-slate-900 dark:via-slate-900/90" />

        <motion.div
          className="flex w-max items-center gap-8 px-4"
          animate={{ x: ['0%', '-50%'] }}
          transition={{
            duration: Math.max(26, countryUsers.length * 2),
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {[...countryUsers, ...countryUsers].map((countryUser, index) => {
            const fallbackLetter = (countryUser.name[0] || countryUser.username[0] || 'U').toUpperCase();
            const avatarSrc = resolveAvatarUrl(countryUser as Record<string, unknown>) || undefined;
            return (
              <motion.div
                key={`${countryUser.id}-${countryUser.country}-${index}`}
                className="relative flex shrink-0 min-w-72 items-center gap-4 rounded-2xl border border-cyan-200/70 dark:border-cyan-700/50 bg-white/88 dark:bg-slate-900/72 px-4 py-3 shadow-[0_12px_32px_-18px_rgba(14,116,144,0.65)]"
                initial={{ opacity: 0.85, y: 4 }}
                animate={{ opacity: 1, y: [0, -4, 0] }}
                transition={{
                  opacity: { duration: 0.35 },
                  y: {
                    duration: 3.2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: (index % Math.max(1, countryUsers.length)) * 0.08,
                  },
                }}
                whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.2 } }}
              >
                <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-cyan-500/0 via-cyan-500/5 to-blue-500/10 pointer-events-none" />

                <Avatar className="h-14 w-14 border-2 border-cyan-300/80 dark:border-cyan-600/70 shadow-md shrink-0">
                  <AvatarImage src={avatarSrc} alt={countryUser.name} className="object-cover" />
                  <AvatarFallback className="bg-linear-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold">
                    {fallbackLetter}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 relative z-10">
                  <p className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                    {countryUser.name}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-300 truncate">
                    @{countryUser.username}
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 inline-flex items-center gap-1.5 truncate font-semibold mt-0.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-yellow-600 dark:text-yellow-300" />
                    <motion.span
                      className="truncate"
                      animate={{ opacity: [1, 0.45, 1], scale: [1, 1.03, 1] }}
                      transition={{
                        duration: 0.95,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: (index % Math.max(1, countryUsers.length)) * 0.04,
                      }}
                    >
                      {countryUser.country}
                    </motion.span>
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  ) : null;

  useEffect(() => {
    if (isMobile || mobilePerformanceMode) return;

    let cancelled = false;

    const loadUsers = async () => {
      try {
        const usersRef = query(collection(firestoreDb, 'users'), limit(120));
        const snapshot = await getDocs(usersRef);
        if (cancelled) return;

        const usersFromDb: CountryUserHighlight[] = [];

        snapshot.forEach((userDoc) => {
          const data = userDoc.data() as Record<string, unknown>;
          const country = getCountryFromUserData(data) || 'Not specified';

          const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
          const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : '';
          const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
          const username = typeof data.username === 'string' ? data.username.trim() : '';
          const email = typeof data.email === 'string' ? data.email.trim() : '';
          const emailHandle = email.includes('@') ? email.split('@')[0] : email;
          const profilePicture = typeof data.profilePicture === 'string' ? data.profilePicture.trim() : '';
          const resolvedAvatar = profilePicture || resolveAvatarUrl(data);

          const name = displayName || `${firstName} ${lastName}`.trim() || username || emailHandle || 'Traveller';
          const handle = username || emailHandle || 'traveller';

          usersFromDb.push({
            id: userDoc.id,
            name,
            username: handle,
            country,
            profilePictureUrl: resolvedAvatar,
            avatarUrl: resolvedAvatar,
          });
        });

        const nextCountryUsers = usersFromDb.sort((a, b) => a.name.localeCompare(b.name));
        setCountryUsers(nextCountryUsers);
      } catch {
        if (!cancelled) setCountryUsers([]);
      }
    };

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [isMobile, mobilePerformanceMode]);

  useEffect(() => {
    const creatorIds = Array.from(
      new Set(
        privateRooms
          .map((room) => String(room.createdBy || '').trim())
          .filter((id) => id.length > 0)
      )
    );

    if (creatorIds.length === 0) {
      setCommunityOwnerMap({});
      return;
    }

    let cancelled = false;

    const loadOwnerProfiles = async () => {
      const nextMap: Record<string, CommunityOwnerProfile> = {};
      const chunkSize = 10;
      const chunks: string[][] = [];

      for (let i = 0; i < creatorIds.length; i += chunkSize) {
        chunks.push(creatorIds.slice(i, i + chunkSize));
      }

      await Promise.allSettled(
        chunks.map(async (chunk) => {
          const usersQuery = query(collection(firestoreDb, 'users'), where('__name__', 'in', chunk));
          const usersSnap = await getDocs(usersQuery);

          usersSnap.forEach((userDoc) => {
            const data = userDoc.data() as Record<string, unknown>;
            const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : '';
            const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : '';
            const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
            const username = typeof data.username === 'string' ? data.username.trim() : '';
            const email = typeof data.email === 'string' ? data.email.trim() : '';
            const emailHandle = email.includes('@') ? email.split('@')[0] : email;
            const resolvedName = displayName || `${firstName} ${lastName}`.trim() || username || emailHandle || `User ${userDoc.id.slice(0, 6)}`;

            nextMap[userDoc.id] = {
              displayName: resolvedName,
              avatarUrl: resolveAvatarUrl(data) || '',
            };
          });
        })
      );

      creatorIds.forEach((creatorId) => {
        if (!nextMap[creatorId]) {
          const selfDisplayName =
            creatorId === user?.uid
              ? (
                String(userProfile?.displayName || '').trim() ||
                String(user?.displayName || '').trim() ||
                String(userProfile?.username || '').trim() ||
                String(user?.email || '').split('@')[0] ||
                `User ${creatorId.slice(0, 6)}`
              )
              : `User ${creatorId.slice(0, 6)}`;

          nextMap[creatorId] = {
            displayName: selfDisplayName,
            avatarUrl: creatorId === user?.uid ? currentUserAvatar || '' : '',
          };
        }
      });

      if (!cancelled) {
        setCommunityOwnerMap(nextMap);
      }
    };

    void loadOwnerProfiles();

    return () => {
      cancelled = true;
    };
  }, [privateRooms, user?.displayName, user?.email, user?.uid, userProfile?.displayName, userProfile?.username, currentUserAvatar]);



  const selectedPlaceImages = useMemo(
    () => selectedPlace?.media?.filter((m) => m.type === 'image') ?? [],
    [selectedPlace?.media]
  );

  const selectedPlaceVideos = useMemo(
    () => selectedPlace?.media?.filter((m) => m.type === 'video') ?? [],
    [selectedPlace?.media]
  );

  const selectedPlaceReviewList = useMemo(
    () => (selectedPlace?.id ? (placeReviews[selectedPlace.id] ?? []) : []),
    [placeReviews, selectedPlace?.id]
  );

  const selectedPlaceAverageRating = useMemo(() => {
    if (selectedPlaceReviewList.length === 0) return 0;
    return selectedPlaceReviewList.reduce((sum, review) => sum + review.rating, 0) / selectedPlaceReviewList.length;
  }, [selectedPlaceReviewList]);

  const handleSelectPlace = useCallback((place: TouristPlace) => {
    setSelectedPlace(place);
    setSelectedPlaceMediaIdx(0);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const communityRoomsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobilePerformanceMode || !videoRef.current) return;
    videoRef.current.pause();
    setIsVideoPlaying(false);
  }, [mobilePerformanceMode]);

  // Scroll to + reset detail panel when a place is selected
  useEffect(() => {
    if (selectedPlace) {
      setSelectedPlaceShareMessage('');
      setDetailVidIdx(0);
      setDetailVidPaused(false);
      setDetailBannerImgIdx(0);
      setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [selectedPlace]);

  useEffect(() => {
    userMediaFiles.forEach((item) => revokeImagePreview(item.preview));
    setUserMediaFiles([]);
    setUserMediaError('');
    setReviewCommentInputs({});
    setOpenReviewCommentReviewId(null);
    setUserAvatarMap({});
  }, [selectedPlace?.id]);

  // Auto-advance banner images when no video available
  useEffect(() => {
    if (!selectedPlace) return;
    if (selectedPlaceVideos.length > 0 || selectedPlaceImages.length <= 1) return;
    const t = setInterval(() => setDetailBannerImgIdx((i) => (i + 1) % selectedPlaceImages.length), 3000);
    return () => clearInterval(t);
  }, [selectedPlace?.id, selectedPlaceImages.length, selectedPlaceVideos.length]);

  // Subscribe to media comments for selected place
  useEffect(() => {
    if (!selectedPlace?.id) { setMediaComments({}); return; }
    const q = query(
      collection(firestoreDb, 'touristPlaces', selectedPlace.id, 'mediaComments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const grouped: Record<string, { id: string; text: string; author: string; userId: string; createdAt: unknown }[]> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = data.mediaKey as string;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ id: d.id, text: data.text, author: data.author, userId: data.userId, createdAt: data.createdAt });
      });
      setMediaComments(grouped);
    });
    return () => unsub();
  }, [selectedPlace?.id]);

  // Subscribe to place-level reviews for selected place
  useEffect(() => {
    if (!selectedPlace?.id) {
      setReviewInput('');
      setReviewRating(0);
      setReviewComments({});
      return;
    }
    const q = query(
      collection(firestoreDb, 'touristPlaces', selectedPlace.id, 'reviews'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const reviews = snap.docs.map((d) => {
        const data = d.data();
        const rawRating = Number(data.rating);
        const reviewMedia: MediaItem[] = Array.isArray(data.media)
          ? data.media
            .map((item) => {
              if (!item || typeof item !== 'object') return null;
              const maybeMedia = item as {
                type?: unknown;
                url?: unknown;
                publicId?: unknown;
                thumbnail?: unknown;
                caption?: unknown;
              };
              const mediaType = maybeMedia.type === 'video' ? 'video' : maybeMedia.type === 'image' ? 'image' : null;
              if (!mediaType || typeof maybeMedia.url !== 'string' || typeof maybeMedia.publicId !== 'string') return null;
              return {
                type: mediaType,
                url: maybeMedia.url,
                publicId: maybeMedia.publicId,
                thumbnail: typeof maybeMedia.thumbnail === 'string' ? maybeMedia.thumbnail : undefined,
                caption: typeof maybeMedia.caption === 'string' ? maybeMedia.caption : undefined,
              } as MediaItem;
            })
            .filter((item): item is MediaItem => item !== null)
          : [];
        return {
          id: d.id,
          text: (data.text as string) ?? '',
          author: (data.author as string) ?? 'Traveller',
          userId: (data.userId as string) ?? 'anonymous',
          avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
          rating: Number.isFinite(rawRating) ? Math.max(1, Math.min(5, rawRating)) : 5,
          createdAt: data.createdAt,
          media: reviewMedia,
        };
      });
      setPlaceReviews((prev) => ({ ...prev, [selectedPlace.id!]: reviews }));
    });
    return () => unsub();
  }, [selectedPlace?.id]);

  useEffect(() => {
    if (!selectedPlace?.id || selectedPlaceReviewList.length === 0) {
      setReviewComments({});
      return;
    }

    const unsubscribeReviewComments = selectedPlaceReviewList.map((review) => {
      const reviewCommentsQuery = query(
        collection(firestoreDb, 'touristPlaces', selectedPlace.id!, 'reviews', review.id, 'comments'),
        orderBy('createdAt', 'asc')
      );

      return onSnapshot(reviewCommentsQuery, (snap) => {
        const comments: ReviewComment[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            text: (data.text as string) ?? '',
            author: (data.author as string) ?? 'Traveller',
            userId: (data.userId as string) ?? 'anonymous',
            avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined,
            createdAt: data.createdAt,
          };
        });

        setReviewComments((prev) => ({ ...prev, [review.id]: comments }));
      });
    });

    return () => {
      unsubscribeReviewComments.forEach((unsubscribe) => unsubscribe());
    };
  }, [selectedPlace?.id, selectedPlaceReviewList]);

  useEffect(() => {
    const candidateUserIds = new Set<string>();

    selectedPlaceReviewList.forEach((review) => {
      if (review.userId && review.userId !== 'anonymous') {
        candidateUserIds.add(review.userId);
      }
      (reviewComments[review.id] ?? []).forEach((comment) => {
        if (comment.userId && comment.userId !== 'anonymous') {
          candidateUserIds.add(comment.userId);
        }
      });
    });

    if (candidateUserIds.size === 0) return;

    const unsubscribers = Array.from(candidateUserIds).map((userId) => {
      const userRef = doc(firestoreDb, 'users', userId);
      return onSnapshot(userRef, (snapshot) => {
        const avatarUrl = snapshot.exists() ? resolveAvatarUrl(snapshot.data() as Record<string, unknown>) : '';
        setUserAvatarMap((prev) => {
          if (avatarUrl && prev[userId] === avatarUrl) return prev;
          if (!avatarUrl && !prev[userId]) return prev;

          const next = { ...prev };
          if (avatarUrl) {
            next[userId] = avatarUrl;
          } else {
            delete next[userId];
          }
          return next;
        });
      });
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [selectedPlaceReviewList, reviewComments]);

  const submitMediaComment = async (mediaKey: string) => {
    const text = (commentInputs[mediaKey] ?? '').trim();
    if (!text || !selectedPlace?.id) return;
    setCommentSubmitting(true);
    try {
      await addDoc(collection(firestoreDb, 'touristPlaces', selectedPlace.id, 'mediaComments'), {
        mediaKey,
        text,
        author: user?.displayName ?? user?.email ?? 'Traveller',
        userId: user?.uid ?? 'anonymous',
        createdAt: serverTimestamp(),
      });
      setCommentInputs(prev => ({ ...prev, [mediaKey]: '' }));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const submitPlaceReview = async () => {
    if (!selectedPlace?.id || reviewRating < 1 || reviewRating > 5) return;
    setReviewSubmitting(true);
    setUserMediaUploading(userMediaFiles.length > 0);
    setUserMediaError('');
    try {
      const reviewText = reviewInput.trim();
      const reviewMedia: MediaItem[] = [];
      for (const { file } of userMediaFiles) {
        const isVideo = file.type.startsWith('video/');
        const mediaItem = isVideo
          ? await uploadVideoToR2(file)
          : await uploadImageToR2(file, { folder: 'tourist-places/user-images' });

        const reviewMediaItem: MediaItem = {
          type: isVideo ? 'video' : 'image',
          url: mediaItem.url,
          publicId: mediaItem.key,
        };

        if (reviewText) {
          reviewMediaItem.caption = reviewText;
        }

        reviewMedia.push(reviewMediaItem);
      }

      await addDoc(collection(firestoreDb, 'touristPlaces', selectedPlace.id, 'reviews'), {
        text: reviewText,
        rating: reviewRating,
        author: user?.displayName ?? user?.email ?? 'Traveller',
        userId: user?.uid ?? 'anonymous',
        avatarUrl: currentUserAvatar,
        media: reviewMedia,
        createdAt: serverTimestamp(),
      });
      setReviewInput('');
      setReviewRating(0);
      userMediaFiles.forEach((item) => revokeImagePreview(item.preview));
      setUserMediaFiles([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to post review.';
      setUserMediaError(message);
    } finally {
      setReviewSubmitting(false);
      setUserMediaUploading(false);
    }
  };

  const submitReviewComment = async (reviewId: string) => {
    const text = (reviewCommentInputs[reviewId] ?? '').trim();
    if (!text || !selectedPlace?.id) return;

    setReviewCommentSubmitting(true);
    try {
      await addDoc(collection(firestoreDb, 'touristPlaces', selectedPlace.id, 'reviews', reviewId, 'comments'), {
        text,
        author: user?.displayName ?? user?.email ?? 'Traveller',
        userId: user?.uid ?? 'anonymous',
        avatarUrl: currentUserAvatar,
        createdAt: serverTimestamp(),
      });
      setReviewCommentInputs((prev) => ({ ...prev, [reviewId]: '' }));
    } finally {
      setReviewCommentSubmitting(false);
    }
  };

  const handleUserMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(e.target.files ?? []);
    if (pickedFiles.length === 0) return;

    const validFiles = pickedFiles.filter((file) => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) return false;
      if (isVideo && file.size > 100 * 1024 * 1024) return false;
      return true;
    });

    if (validFiles.length === 0) {
      setUserMediaError('Select valid image/video files. Video limit is 100MB per file.');
      return;
    }

    userMediaFiles.forEach((item) => revokeImagePreview(item.preview));
    setUserMediaFiles(validFiles.map((file) => ({ file, preview: createImagePreview(file) })));
    setUserMediaError(validFiles.length < pickedFiles.length ? 'Some invalid files were skipped.' : '');
    e.target.value = '';
  };

  // Reset pagination when search changes
  useEffect(() => {
    setSearchPage(1);
    setSearchHasMore(false);
    setFirestorePlaces([]);
  }, [normalizedSearchDestination]);

  // Fetch tourist places once when the explore section opens.
  useEffect(() => {
    if (selectedCategory !== 'outdoors') return;
    let cancelled = false;

    const fetchPlaces = async () => {
      // We now allow fetching even without a search query to support category browsing
      setSearchLoading(true);
      try {
        const response = await placesAPI.searchPlaces({
          search: normalizedSearchDestination,
          page: searchPage,
          limit: 100,
        });

        if (cancelled) return;

        const data = response.data?.data ?? response.data ?? {};
        const rows = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.results)
            ? data.results
            : [];

        const hasMore = Boolean(data.hasMore);

        const normalizedPlaces = rows
          .map((row: unknown) => {
            if (!row || typeof row !== 'object') return null;
            const raw = row as Record<string, unknown>;
            const id = typeof raw.id === 'string' ? raw.id : '';
            if (!id) return null;

            return {
              id,
              name: String(raw.name || ''),
              area: String(raw.area || ''),
              city: String(raw.city || raw.area || ''),
              state: String(raw.state || ''),
              country: String(raw.country || ''),
              description: String(raw.description || ''),
              category: String(raw.category || 'Other'),
              isActive: raw.isActive !== false,
              googleMapsUrl: String(raw.googleMapsUrl || ''),
              coverImage: String(raw.coverImage || ''),
              media: Array.isArray(raw.media) ? (raw.media as MediaItem[]) : [],
              extraInfo: Array.isArray(raw.extraInfo) ? raw.extraInfo : [],
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            } as TouristPlace;
          })
          .filter((place: TouristPlace | null): place is TouristPlace => place !== null);

        if (searchPage === 1) {
          setFirestorePlaces(normalizedPlaces);
        } else {
          setFirestorePlaces(prev => {
            const existingIds = new Set(prev.map((p: TouristPlace) => p.id));
            const newPlaces = normalizedPlaces.filter((p: TouristPlace) => !existingIds.has(p.id));
            return [...prev, ...newPlaces];
          });
        }
        setSearchHasMore(hasMore);
      } catch {
        if (!cancelled) {
          if (searchPage === 1) setFirestorePlaces([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    void fetchPlaces();
    return () => {
      cancelled = true;
    };
  }, [normalizedSearchDestination, searchPage, selectedCategory]);

  useEffect(() => {
    if (shouldOpenExploreInterest) {
      router.replace('/tourplaces');
    }
  }, [shouldOpenExploreInterest]);

  // When search output changes, close any opened place/detail cards.
  useEffect(() => {
    setSelectedPlaceShareMessage('');
    if (!selectedPlace && !openCommentKey) return;
    setSelectedPlace(null);
    setOpenCommentKey(null);
    setOpenReviewCommentReviewId(null);
  }, [searchDestination]);

  // Memoized event handlers
  const _toggleVideoPlayback = useCallback(() => {
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

  const scrollToCommunityRooms = useCallback(() => {
    setTimeout(() => {
      communityRoomsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  }, []);

  const scrollToExploreOutdoors = useCallback(() => {
    router.push('/tourplaces');
  }, [router]);

  const openTripStories = useCallback(() => {
    router.push('/trip-stories');
  }, [router]);

  const openTravelItinerary = useCallback(() => {
    router.push('/travel-destinations');
  }, [router]);

  // Load chat communities
  useEffect(() => {
    try {
      if (!user) {
        setRooms([]);
        setUserCreatedRoomsCount(0);
        setUserCreatedPrivateRoomsCount(0);
        setLoading(false);
        return;
      }

      const unsubscribe = chatService.listenToUserRooms((loadedRooms: ChatRoomType[]) => {
        setRooms(loadedRooms);

        // Count rooms created by current user
        const createdByUser = loadedRooms.filter(room => room.createdBy === user.uid);
        setUserCreatedRoomsCount(createdByUser.length);

        // Policy limit is based on private rooms the user creates.
        const createdPrivateCount = createdByUser.filter((room) => !room.isPublic).length;
        setUserCreatedPrivateRoomsCount(createdPrivateCount);

        // If a requested private room gets approved, open it immediately.
        if (typeof window !== 'undefined') {
          try {
            const stored = window.localStorage.getItem(PENDING_PRIVATE_JOIN_ROOMS_KEY);
            const parsed = stored ? JSON.parse(stored) : [];
            const pendingRoomIds = Array.isArray(parsed)
              ? parsed.filter((id): id is string => typeof id === 'string')
              : [];

            if (pendingRoomIds.length > 0) {
              const approvedRoom = loadedRooms.find((room) => {
                if (!room.id || room.isPublic) return false;
                const isTracked = pendingRoomIds.includes(room.id);
                const hasAccess = room.createdBy === user.uid || (room.participants || []).includes(user.uid);
                return isTracked && hasAccess;
              });

              if (approvedRoom?.id) {
                const remainingRoomIds = pendingRoomIds.filter((id) => id !== approvedRoom.id);
                if (remainingRoomIds.length > 0) {
                  window.localStorage.setItem(PENDING_PRIVATE_JOIN_ROOMS_KEY, JSON.stringify(remainingRoomIds));
                } else {
                  window.localStorage.removeItem(PENDING_PRIVATE_JOIN_ROOMS_KEY);
                }

                router.push(`/community/room/${approvedRoom.id}`);
                return;
              }
            }
          } catch {
            // Auto-open is best-effort; list should still render.
          }
        }

        setLoading(false);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    } catch (error) {
      if ((process.env.NODE_ENV === "development")) {
        console.error('Error loading chat communities:', error);
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
      userMediaFiles.forEach((item) => revokeImagePreview(item.preview));
    };
  }, [backgroundImagePreview, iconImagePreview, userMediaFiles]);

  // Create new room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateRoomError('');

    if (!newRoomName.trim() || !user) return;

    if (!newRoomIsPublic && !paidMember) {
      router.push('/pricing?source=private-community');
      return;
    }

    if (!canCreatePrivateCommunity) {
      setCreateRoomError('Only subscribed users can create private community chat.');
      return;
    }

    if (!newRoomIsPublic && !isAdminOrOwner && !privateRoomAllowance.allowed) {
      setCreateRoomError(privateRoomAllowance.reason);
      return;
    }

    if (!newRoomIsPublic && !isAdminOrOwner) {
      const latestCreateStats = await chatService.getUserCreatedRoomStats(user.uid);
      const latestPrivateCreatedCount = latestCreateStats.private;
      setUserCreatedPrivateRoomsCount(latestPrivateCreatedCount);
      const latestAllowance = getPrivateRoomCreateAllowance(
        userProfile,
        latestPrivateCreatedCount,
        privateRoomLimitSettings
      );
      if (!latestAllowance.allowed) {
        setCreateRoomError(latestAllowance.reason);
        return;
      }
    }

    setCreating(true);
    setUploadingImages(true);

    try {
      let backgroundImageData: ImageUploadResult | undefined;
      let iconImageData: ImageUploadResult | undefined;

      // Upload background image if selected
      if (backgroundImageFile) {
        try {
          backgroundImageData = await uploadImageToR2(backgroundImageFile, {
            folder: 'chat-rooms/backgrounds',
            convertToWebP: true,
            webpQuality: 0.82,
            maxImageDimension: 1920,
          });
        } catch (error: any) {
          throw new Error(`Background image upload failed: ${error.message}`);
        }
      }

      // Upload icon image if selected
      if (iconImageFile) {
        try {
          iconImageData = await uploadImageToR2(iconImageFile, {
            folder: 'chat-rooms/icons',
            convertToWebP: true,
            webpQuality: 0.8,
            maxImageDimension: 512,
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
        newRoomIsPublic,
        '',
        [user.uid],
        backgroundImageData,
        iconImageData,
        newRoomIsPublic ? undefined : newPrivateVisibility,
        {
          maxPrivateRooms:
            newRoomIsPublic || !Number.isFinite(privateRoomAllowance.maxAllowed)
              ? undefined
              : privateRoomAllowance.maxAllowed,
          limits: newRoomIsPublic ? undefined : privateRoomLimitSettings,
        }
      );

      // Reset form
      setShowCreateDialog(false);
      setNewRoomName('');
      setNewRoomDescription('');
      setNewRoomPassword('');
      setNewRoomIsPublic(false);
      setNewPrivateVisibility('private');
      setCreateRoomError('');
      removeBackgroundImage();
      removeIconImage();

      // Navigate to the new room
      router.push(`/community/room/${roomId}`);
    } catch (error: any) {
      const message = error?.message || 'Failed to create room';
      const expectedPolicyError =
        message.toLowerCase().includes('private community limit') ||
        message.toLowerCase().includes('requires an active paid subscription');

      if ((process.env.NODE_ENV === "development") && !expectedPolicyError) {
        console.error('Error creating room:', error);
      }

      setCreateRoomError(message);
      setUploadingImages(false);
    } finally {
      setCreating(false);
    }
  };

  // Handle share room
  const _handleShareRoom = (room: ChatRoomType, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareRoom(room);
    setShowShareDialog(true);
    setCopiedInvite(false);
    setCopiedPassword(false);
    setSocialShareMessage('');
  };

  // Copy invite link
  const copyInviteLink = () => {
    if (!shareRoom || !shareRoom.id || !shareRoom.inviteToken) return;

    const inviteLink = chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken);
    navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 1000);
  };

  // Copy room credentials
  const copyCredentials = () => {
    if (!shareRoom || !shareRoom.id) return;

    const credentials = `Community ID: ${shareRoom.id}\nPassword: ${shareRoom.password || 'N/A'}`;
    navigator.clipboard.writeText(credentials);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 1000);
  };

  const shareRoomOnSocial = (platform: 'facebook' | 'instagram' | 'whatsapp') => {
    if (!shareRoom?.id || !shareRoom.inviteToken) return;

    const inviteLink = chatService.getInviteLink(shareRoom.id, shareRoom.inviteToken);
    const shareText = `Join my community "${shareRoom.name}" on ABjee Travel: ${inviteLink}`;

    if (platform === 'facebook') {
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}&quote=${encodeURIComponent(shareText)}`;
      window.open(fbUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (platform === 'whatsapp') {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    void navigator.clipboard
      .writeText(shareText)
      .then(() => setSocialShareMessage('Invite copied. Paste it on Instagram in DM, bio, or story link.'))
      .catch(() => setSocialShareMessage('Could not auto-copy invite. Use the Copy button and paste it on Instagram.'));
    setTimeout(() => setSocialShareMessage(''), 1200);
  };

  const shareSelectedPlaceOnSocial = (platform: 'facebook' | 'instagram' | 'whatsapp') => {
    if (!selectedPlace) return;

    const placeLocation = [selectedPlace.area, selectedPlace.state, selectedPlace.country]
      .filter(Boolean)
      .join(', ');
    const targetUrl = selectedPlace.googleMapsUrl || window.location.href;
    const shareText = `Check out ${selectedPlace.name}${placeLocation ? ` (${placeLocation})` : ''} on ABjee Travel. ${targetUrl}`;

    if (platform === 'facebook') {
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}&quote=${encodeURIComponent(shareText)}`;
      window.open(fbUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (platform === 'whatsapp') {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    void navigator.clipboard
      .writeText(shareText)
      .then(() => setSelectedPlaceShareMessage('Place details copied. Paste it on Instagram in DM, bio, or story link.'))
      .catch(() => setSelectedPlaceShareMessage('Could not auto-copy place details. Please copy manually for Instagram.'));
    setTimeout(() => setSelectedPlaceShareMessage(''), 1200);
  };

  // Delete community
  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const targetRoom = rooms.find((r) => r.id === roomId);
    const normalizedRoomName = (targetRoom?.name || '').trim().toLowerCase();
    const isGeneralCommunity =
      normalizedRoomName === 'general community chat' ||
      normalizedRoomName === 'general chat' ||
      normalizedRoomName.startsWith('general chat') ||
      normalizedRoomName.includes('general community');

    if (isGeneralCommunity) {
      alert('General Community Chat cannot be deleted from client side.');
      return;
    }

    const confirmed = await modernConfirm('Are you sure you want to delete this community? This action cannot be undone.', {
      title: 'Delete Community',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    try {
      await chatService.deleteRoom(roomId);
    } catch (error: any) {
      alert(error.message || 'Failed to delete community');
    }
  };

  const handleSendJoinRequest = async (room: ChatRoomType, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user || !room.id) return;

    const participants = Array.isArray(room.participants) ? room.participants : [];
    const isParticipant = room.createdBy === user.uid || participants.includes(user.uid);
    if (isParticipant) return;

    if (joinRequestingRoomIds.has(room.id)) return;

    setJoinRequestingRoomIds((prev) => new Set(prev).add(room.id!));

    try {
      await chatService.requestToJoinRoom(room.id, user.uid);

      // Optimistically mark request as sent until room listener confirms.
      setRooms((prevRooms) =>
        prevRooms.map((candidate) => {
          if (candidate.id !== room.id) return candidate;
          const existingRequests = Array.isArray(candidate.joinRequests) ? candidate.joinRequests : [];
          if (existingRequests.includes(user.uid)) return candidate;
          return {
            ...candidate,
            joinRequests: [...existingRequests, user.uid],
          };
        })
      );

      if (typeof window !== 'undefined') {
        try {
          const stored = window.localStorage.getItem(PENDING_PRIVATE_JOIN_ROOMS_KEY);
          const parsed = stored ? JSON.parse(stored) : [];
          const pendingRoomIds = Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === 'string')
            : [];
          if (!pendingRoomIds.includes(room.id)) {
            pendingRoomIds.push(room.id);
            window.localStorage.setItem(PENDING_PRIVATE_JOIN_ROOMS_KEY, JSON.stringify(pendingRoomIds));
          }
        } catch {
          // Best-effort local tracking only.
        }
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to send join request');
    } finally {
      setJoinRequestingRoomIds((prev) => {
        const next = new Set(prev);
        if (room.id) next.delete(room.id);
        return next;
      });
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

  const formatReviewDate = (createdAt: unknown) => {
    if (!createdAt) return 'Just now';
    const maybeTimestamp = createdAt as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().toLocaleDateString();
    }
    if (typeof maybeTimestamp.seconds === 'number') {
      return new Date(maybeTimestamp.seconds * 1000).toLocaleDateString();
    }
    return 'Just now';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary/30 border-t-primary mx-auto"></div>
            <Users className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="mt-6 text-lg font-medium bg-linear-to-r from-rose-600 to-pink-500 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
            Loading communities...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Inspirational Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <h1 className="text-3xl md:text-5xl font-bold">
            <BlurInText
              text="Traveller's Best Place to Explore"
              blurAmount={12}
              duration={1}
              stagger={0.02}
              split="letter"
              trigger="mount"
              className="text-rose-600 dark:text-rose-400"
            />
          </h1>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          id="explore-your-interest"
          className="mb-12 py-4 scroll-mt-32"
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
              onClick={scrollToExploreOutdoors}
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-blue-500 via-cyan-500 to-teal-500 p-5 sm:p-6 shadow-xl hover:shadow-2xl transition-all duration-300`}>
                {/* Video Background */}
                <video
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  disableRemotePlayback
                  disablePictureInPicture
                  preload={shouldAutoplayRichMedia ? 'metadata' : 'auto'}
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V1} type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-blue-900/60 via-cyan-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Compass className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-100 dark:text-white mb-2 drop-shadow-lg">
                      Explore Tourist Places
                    </h3>
                    <p className="text-gray-300 dark:text-white/90 text-base drop-shadow-md">
                      Top Travel destinations around the World. Review from Travellers.
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
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-rose-400 via-pink-400 to-red-400 p-5 sm:p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(236,72,153,0.5)] transition-all duration-500`}>
                {/* Video Background */}
                <video
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V2} type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-rose-900/60 via-pink-900/50 to-red-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-rose-400/30 via-pink-400/20 to-red-400/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {!mobilePerformanceMode && (
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                  />
                )}
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
                      className="text-2xl font-bold text-gray-100 dark:text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Connect with Fellow Travellers
                    </motion.h3>
                    <p className="text-gray-300 dark:text-white/95 text-base drop-shadow-lg font-medium">
                      Plan trip together and share experiences with Travellers worldwide.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Trip Stories */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.08, y: -8, rotateY: 2 }}
              onClick={openTripStories}
              className="group cursor-pointer"
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-yellow-400 via-amber-300 to-yellow-300 p-5 sm:p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(180,83,9,0.5)] transition-all duration-500`}>
                {/* Video Background */}
                <video
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V3} type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-yellow-700/60 via-amber-700/50 to-yellow-700/60" />
                <div className="absolute inset-0 bg-linear-to-br from-yellow-400/30 via-amber-400/20 to-yellow-300/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <motion.div
                  className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
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
                    <Eye className="h-9 w-9 text-white drop-shadow-lg" />
                  </motion.div>
                  <div>
                    <motion.h3
                      className="text-2xl font-bold text-white dark:text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Trip Stories
                    </motion.h3>
                    <p className="text-gray-200 dark:text-white/95 text-base drop-shadow-lg font-medium">
                      Get inspired by photos and stories from real travelers
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Make a Perfect Travel Itenary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -5 }}
              onClick={openTravelItinerary}
              className="group cursor-pointer"
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-green-500 via-emerald-500 to-teal-500 p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-300`}>
                {/* Video Background */}
                <video
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V4} type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-green-900/60 via-emerald-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-green-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Calendar className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-100 dark:text-white mb-2">
                      Make a Perfect Travel Itenerary
                    </h3>
                    <p className="text-gray-300 dark:text-white/90 text-base">
                      Get the Best Travel Itinarary as per your choice.
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
              onClick={scrollToExploreOutdoors}
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-blue-500 via-cyan-500 to-teal-500 p-5 sm:p-6 shadow-xl hover:shadow-2xl transition-all duration-300`}>
                {/* Video Background */}
                <video
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V1} type="video/mp4" />
                </video>
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-blue-900/60 via-cyan-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-blue-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Compass className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-100 dark:text-white mb-2 drop-shadow-lg">
                      Explore Tourist Places
                    </h3>
                    <p className="text-gray-300 dark:text-white/90 text-base drop-shadow-md">
                      Top Travel destinations around the World. Review from Travellers.
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
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-rose-400 via-pink-400 to-red-400 p-5 sm:p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(236,72,153,0.5)] transition-all duration-500`}>
                {/* Video Background */}
                {!isMobile && (
                  <video
                    autoPlay={shouldAutoplayRichMedia}
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  >
                    <source src={STATIC_VIDEO_V2} type="video/mp4" />
                  </video>
                )}
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-rose-900/60 via-pink-900/50 to-red-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-rose-400/30 via-pink-400/20 to-red-400/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {!isMobile && (
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                  />
                )}
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
                      className="text-2xl font-bold text-white dark:text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Connect with Fellow Travellers
                    </motion.h3>
                    <p className="text-gray-300 dark:text-white/95 text-base drop-shadow-lg font-medium">
                      Plan trip together and share experiences with Travellers worldwide.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Trip Stories */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.08, y: -8, rotateY: 2 }}
              onClick={openTripStories}
              className="group cursor-pointer"
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-yellow-400 via-amber-300 to-yellow-300 p-5 sm:p-6 shadow-2xl hover:shadow-[0_20px_50px_rgba(180,83,9,0.5)] transition-all duration-500`}>
                {/* Video Background */}
                {!isMobile && (
                  <video
                    autoPlay={shouldAutoplayRichMedia}
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  >
                    <source src={STATIC_VIDEO_V3} type="video/mp4" />
                  </video>
                )}
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-yellow-700/60 via-amber-700/50 to-yellow-700/60" />
                <div className="absolute inset-0 bg-linear-to-br from-yellow-400/30 via-amber-400/20 to-yellow-300/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {!isMobile && (
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                  />
                )}
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{
                      scale: [1, 1.15, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.5 }}
                    className="w-16 h-16 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:bg-white/35 transition-colors duration-300"
                  >
                    <Eye className="h-9 w-9 text-white drop-shadow-lg" />
                  </motion.div>
                  <div>
                    <motion.h3
                      className="text-2xl font-bold text-white dark:text-white mb-2 drop-shadow-2xl"
                      whileHover={{ scale: 1.05 }}
                    >
                      Trip Stories
                    </motion.h3>
                    <p className="text-gray-200 dark:text-white/95 text-base drop-shadow-lg font-medium">
                      Get inspired by photos and stories from real travelers
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 4: Make a Perfect Travel Itenary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.05, y: -5 }}
              onClick={openTravelItinerary}
              className="group cursor-pointer"
            >
              <div className={`relative ${featureCardHeightClass} rounded-3xl overflow-hidden bg-linear-to-br from-green-500 via-emerald-500 to-teal-500 p-6 sm:p-8 shadow-xl hover:shadow-2xl transition-all duration-300`}>
                {/* Video Background */}
                {!isMobile && (
                  <video
                    autoPlay={shouldAutoplayRichMedia}
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  >
                    <source src={STATIC_VIDEO_V4} type="video/mp4" />
                  </video>
                )}
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-br from-green-900/60 via-emerald-900/50 to-teal-900/60" />
                <div className="absolute inset-0 bg-linear-to-br from-green-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    <Calendar className="h-8 w-8 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-100 dark:text-white mb-2">
                      Make a Perfect Travel Itenerary
                    </h3>
                    <p className="text-gray-300 dark:text-white/90 text-base">
                      Get the Best Travel Itinarary as per your choice.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Category Explore Section (Full Screen) */}
        <AnimatePresence>
          {selectedCategory === 'outdoors' && (
            <motion.div
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="fixed inset-0 z-50 bg-black"
            >
              {/* Background Video */}
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay={shouldAutoplayRichMedia}
                  loop
                  muted
                  playsInline
                  disableRemotePlayback
                  disablePictureInPicture
                  preload={shouldAutoplayRichMedia ? 'metadata' : 'none'}
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={STATIC_VIDEO_V1} type="video/mp4" />
                </video>

                {/* Multi-layer gradient overlay */}
                <div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/20 to-black/70" />
                <div className="absolute inset-0 bg-linear-to-r from-black/30 via-transparent to-black/30" />

                {/* Animated vignette */}
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  animate={{ opacity: [0.4, 0.65, 0.4] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)' }}
                />

                {/* Content - Scrollable */}
                <div
                  className="relative z-10 h-full overflow-y-auto overflow-x-hidden hide-scrollbar"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                >
                  <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }`}</style>
                  <div className="min-h-full flex flex-col items-center justify-start px-4 pt-6 pb-20 gap-8">
                    {/* -- Top bar: Search + Pause + Close -- */}
                    <motion.div
                      initial={{ y: -30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 24 }}
                      className="w-full max-w-3xl flex items-center gap-2 sm:gap-3"
                    >
                      {/* Glassmorphic Search bar */}
                      <div className="relative flex-1 min-w-0 group">
                        <motion.div
                          className="absolute -inset-0.5 rounded-full bg-linear-to-r from-rose-500/40 via-pink-500/40 to-purple-500/40 blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-500"
                        />
                        <div className="relative">
                          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10 group-focus-within:text-rose-400 transition-colors duration-300" />
                          <input
                            type="text"
                            placeholder="Search by place, area, state, or country"
                            value={searchDestination}
                            onChange={(e) => setSearchDestination(e.target.value)}
                            className="w-full pl-12 pr-10 sm:pl-14 sm:pr-12 py-3.5 sm:py-4 rounded-full bg-white/95 backdrop-blur-xl text-gray-900 placeholder-gray-400 text-sm sm:text-base focus:outline-none shadow-2xl shadow-black/40 transition-all duration-300 focus:bg-white"
                          />
                          {searchDestination && (
                            <motion.button
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              whileTap={{ scale: 0.85 }}
                              type="button"
                              onClick={() => setSearchDestination('')}
                              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full bg-gray-200 hover:bg-rose-100 text-gray-500 hover:text-rose-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </motion.button>
                          )}
                        </div>
                      </div>

                      {/* Pause/Play button */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (videoRef.current) {
                            if (isVideoPlaying) { videoRef.current.pause(); setIsVideoPlaying(false); }
                            else { videoRef.current.play(); setIsVideoPlaying(true); }
                          }
                        }}
                        className="p-2.5 sm:p-3 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 shadow-lg transition-all duration-200 shrink-0"
                      >
                        {isVideoPlaying
                          ? <PauseCircle className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                          : <PlayCircle className="h-6 w-6 sm:h-7 sm:w-7 text-white" />}
                      </motion.button>

                      {/* Close button */}
                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setSelectedCategory(null)}
                        className="p-2.5 sm:p-3 rounded-full bg-white/15 hover:bg-red-500/40 backdrop-blur-md border border-white/20 shadow-lg transition-all duration-200 shrink-0"
                      >
                        <X className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                      </motion.button>
                    </motion.div>

                    {/* -- Tourist Places Grid -- */}
                    {(() => {
                      if (!hasSearchQuery && firestorePlaces.length === 0) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="flex flex-col items-center gap-5 py-28 text-center"
                          >
                            {/* Pulsing animated search icon */}
                            <div className="relative">
                              <motion.div
                                animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                                className="absolute inset-0 rounded-full bg-white/20 blur-xl"
                              />
                              <motion.div
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                className="relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl"
                              >
                                <Search className="h-9 w-9 text-white/80" />
                              </motion.div>
                            </div>
                            <div className="space-y-2">
                              <motion.p
                                animate={{ opacity: [0.7, 1, 0.7] }}
                                transition={{ duration: 3, repeat: Infinity }}
                                className="text-white text-xl font-bold drop-shadow-lg"
                              >
                                Where do you want to go?
                              </motion.p>
                              <p className="text-white/50 text-sm">Search by place, area, state or country</p>
                            </div>
                            {/* Quick suggestion chips */}
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.5 }}
                              className="flex flex-wrap justify-center gap-2 max-w-sm"
                            >
                              {['Tirupati', 'Manali', 'Goa', 'Kerala', 'Shimla', 'Ladakh'].map((chip, i) => (
                                <motion.button
                                  key={chip}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.5 + i * 0.07 }}
                                  whileHover={{ scale: 1.08, y: -2 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setSearchDestination(chip)}
                                  className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 hover:border-white/40 text-white text-sm font-medium transition-all duration-200 shadow-md"
                                >
                                  {chip}
                                </motion.button>
                              ))}
                            </motion.div>
                          </motion.div>
                        );
                      }

                      if (firestorePlaces.length === 0 && !searchLoading) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center gap-4 py-24 text-center"
                          >
                            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                              <MapPin className="h-8 w-8 text-white/50" />
                            </div>
                            <div>
                              <p className="text-white text-lg font-bold">No places found</p>
                              <p className="text-white/50 text-sm mt-1">Try a different search term</p>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              onClick={() => setSearchDestination('')}
                              className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-medium transition-all backdrop-blur-sm"
                            >
                              Clear search
                            </motion.button>
                          </motion.div>
                        );
                      }

                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="w-full max-w-7xl px-2"
                        >
                          {/* Results count badge */}
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center mb-6"
                          >
                            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm font-semibold shadow-lg">
                              <MapPin className="h-4 w-4 text-rose-400" />
                              {firestorePlaces.length} result{firestorePlaces.length !== 1 ? 's' : ''} for &ldquo;{debouncedSearchDestination.trim()}&rdquo;
                            </span>
                          </motion.div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                            {firestorePlaces.map((place, idx) => (
                              <PlaceCard
                                key={place.id ?? idx}
                                place={place}
                                idx={idx}
                                onSelect={() => handleSelectPlace(place)}
                                reducedMotion={mobilePerformanceMode}
                                disableVideoAutoplay={mobilePerformanceMode}
                              />
                            ))}
                          </div>

                          {/* Pagination Load More */}
                          {searchHasMore && (
                            <div className="flex justify-center mt-10 mb-6">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleLoadMore}
                                disabled={searchLoading}
                                className={`px-8 py-3 rounded-full font-semibold transition-all shadow-lg border backdrop-blur-md flex items-center gap-2 ${searchLoading
                                    ? 'bg-white/20 border-white/20 text-white/50 cursor-not-allowed'
                                    : 'bg-white/10 hover:bg-white/20 border-white/30 text-white hover:shadow-white/10'
                                  }`}
                              >
                                {searchLoading ? (
                                  <>
                                    <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  'Load More Destinations'
                                )}
                              </motion.button>
                            </div>
                          )}

                          {searchLoading && !searchHasMore && firestorePlaces.length === 0 && (
                            <div className="flex justify-center mt-12">
                              <div className="h-8 w-8 border-4 border-white/20 border-t-white rounded-full animate-spin shadow-lg" />
                            </div>
                          )}
                        </motion.div>
                      );
                    })()}
                    {/* -- Firestore Place Detail Panel -- */}
                    <AnimatePresence>
                      {selectedPlace && (
                        <motion.div
                          ref={detailPanelRef}
                          initial={{ opacity: 0, y: 40, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 40, scale: 0.98 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          className="w-full max-w-5xl px-2 my-6"
                        >
                          {(() => {
                            const dpVideos = selectedPlaceVideos;
                            const dpImages = selectedPlaceImages;
                            const dpHasVideo = dpVideos.length > 0;
                            const dpHasImages = dpImages.length > 0;
                            return (
                              <div className="bg-white/95 backdrop-blur-xl rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)] border border-white/30">
                                {/* Banner: video-first, then draggable image carousel */}
                                <div className="relative h-56 sm:h-64 md:h-72 overflow-hidden bg-black">
                                  {dpHasVideo ? (
                                    <>
                                      <video
                                        ref={detailBannerVidRef}
                                        key={dpVideos[detailVidIdx]?.url}
                                        src={dpVideos[detailVidIdx]?.url}
                                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.015]"
                                        autoPlay={shouldAutoplayRichMedia}
                                        muted
                                        loop
                                        playsInline
                                        controls={shouldAutoplayRichMedia}
                                        disableRemotePlayback
                                        disablePictureInPicture
                                        preload={shouldAutoplayRichMedia ? 'metadata' : 'none'}
                                        onPlay={() => setDetailVidPaused(false)}
                                        onPause={() => setDetailVidPaused(true)}
                                      />
                                      {/* Pause / Resume */}
                                      <motion.button
                                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                        animate={detailVidPaused ? { scale: 1 } : { scale: [1, 1.08, 1] }}
                                        transition={detailVidPaused ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                        onClick={() => {
                                          const v = detailBannerVidRef.current;
                                          if (!v) return;
                                          if (v.paused) { v.play(); setDetailVidPaused(false); }
                                          else { v.pause(); setDetailVidPaused(true); }
                                        }}
                                        className="absolute bottom-14 right-4 z-20 h-10 w-10 rounded-full bg-linear-to-br from-black/75 to-rose-700/60 hover:from-black/85 hover:to-rose-600/75 backdrop-blur-md border border-white/35 flex items-center justify-center text-white shadow-[0_10px_24px_rgba(0,0,0,0.5)] transition-colors"
                                      >
                                        {detailVidPaused ? <Play className="h-4 w-4 ml-0.5" /> : <PauseCircle className="h-4 w-4" />}
                                      </motion.button>
                                      {/* Prev / Next video */}
                                      {dpVideos.length > 1 && (
                                        <>
                                          <motion.button
                                            whileHover={{ scale: 1.08, x: -1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => setDetailVidIdx(i => (i - 1 + dpVideos.length) % dpVideos.length)}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-black/55 hover:bg-rose-600/75 backdrop-blur-md border border-white/25 flex items-center justify-center text-white transition-colors"
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </motion.button>
                                          <motion.button
                                            whileHover={{ scale: 1.08, x: 1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => setDetailVidIdx(i => (i + 1) % dpVideos.length)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-9 w-9 rounded-full bg-black/55 hover:bg-rose-600/75 backdrop-blur-md border border-white/25 flex items-center justify-center text-white transition-colors"
                                          >
                                            <ChevronRight className="h-4 w-4" />
                                          </motion.button>
                                          <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
                                            {dpVideos.map((_, i) => (
                                              <div key={i} className={`rounded-full transition-all duration-200 ${i === detailVidIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`} />
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      <span className="absolute top-3 left-4 z-20 text-[9px] font-bold bg-rose-600/90 text-white px-2.5 py-1 rounded-full flex items-center gap-1 shadow backdrop-blur-sm pointer-events-none">
                                        <Video className="h-2.5 w-2.5" /> VIDEO {dpVideos.length > 1 ? `${detailVidIdx + 1}/${dpVideos.length}` : ''}
                                      </span>
                                    </>
                                  ) : dpHasImages ? (
                                    <>
                                      <AnimatePresence mode="popLayout" initial={false}>
                                        <motion.img
                                          key={detailBannerImgIdx}
                                          src={dpImages[detailBannerImgIdx].url}
                                          alt={dpImages[detailBannerImgIdx].caption ?? selectedPlace.name}
                                          className="absolute inset-0 w-full h-full object-cover select-none"
                                          initial={{ opacity: 0, x: 60 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          exit={{ opacity: 0, x: -60 }}
                                          transition={{ duration: 0.22, ease: 'easeOut' }}
                                          drag={dpImages.length > 1 ? 'x' : false}
                                          dragConstraints={{ left: 0, right: 0 }}
                                          dragElastic={0.15}
                                          onDragEnd={(_, info) => {
                                            if (dpImages.length > 1) {
                                              if (info.offset.x < -40) setDetailBannerImgIdx(i => (i + 1) % dpImages.length);
                                              else if (info.offset.x > 40) setDetailBannerImgIdx(i => (i - 1 + dpImages.length) % dpImages.length);
                                            }
                                            detailBannerDragRef.current = Math.abs(info.offset.x) > 10;
                                            setTimeout(() => { detailBannerDragRef.current = false; }, 80);
                                          }}
                                          draggable={false}
                                        />
                                      </AnimatePresence>
                                      {dpImages.length > 1 && (
                                        <>
                                          <button onClick={() => setDetailBannerImgIdx(i => (i - 1 + dpImages.length) % dpImages.length)}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-sm flex items-center justify-center text-white transition-colors">
                                            <ChevronLeft className="h-4 w-4" />
                                          </button>
                                          <button onClick={() => setDetailBannerImgIdx(i => (i + 1) % dpImages.length)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-sm flex items-center justify-center text-white transition-colors">
                                            <ChevronRight className="h-4 w-4" />
                                          </button>
                                          <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
                                            {dpImages.map((_, i) => (
                                              <div key={i} className={`rounded-full transition-all duration-200 ${i === detailBannerImgIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`} />
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </>
                                  ) : selectedPlace.coverImage ? (
                                    <img src={selectedPlace.coverImage} alt={selectedPlace.name} className="w-full h-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="w-full h-full bg-linear-to-br from-rose-600 to-pink-700" />
                                  )}
                                  <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
                                  <div className="absolute bottom-5 left-6 right-16">
                                    <span className="text-[11px] font-bold bg-linear-to-r from-rose-600 to-pink-600 text-white px-3 py-1 rounded-full shadow-lg">
                                      {selectedPlace.category}
                                    </span>
                                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-2 drop-shadow-2xl tracking-tight">
                                      {selectedPlace.name}
                                    </h2>
                                    <div className="flex items-center gap-1.5 text-white/75 text-sm mt-1">
                                      <MapPin className="h-4 w-4 text-rose-400" />
                                      {[selectedPlace.area, selectedPlace.state, selectedPlace.country].filter(Boolean).join(', ')}
                                    </div>
                                  </div>
                                  <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
                                    <motion.button
                                      whileHover={{ scale: 1.08 }}
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => shareSelectedPlaceOnSocial('facebook')}
                                      className="p-2 rounded-full bg-black/50 hover:bg-blue-600/80 text-white transition-colors shadow-lg backdrop-blur-sm"
                                      title="Share this place on Facebook"
                                    >
                                      <Facebook className="h-4 w-4" />
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.08 }}
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => shareSelectedPlaceOnSocial('instagram')}
                                      className="p-2 rounded-full bg-black/50 hover:bg-pink-600/80 text-white transition-colors shadow-lg backdrop-blur-sm"
                                      title="Share this place on Instagram"
                                    >
                                      <Instagram className="h-4 w-4" />
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.08 }}
                                      whileTap={{ scale: 0.92 }}
                                      onClick={() => shareSelectedPlaceOnSocial('whatsapp')}
                                      className="p-2 rounded-full bg-black/50 hover:bg-emerald-600/80 text-white transition-colors shadow-lg backdrop-blur-sm"
                                      title="Share this place on WhatsApp"
                                    >
                                      <MessageCircle className="h-4 w-4" />
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ scale: 1.1, rotate: 90 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => setSelectedPlace(null)}
                                      className="p-2.5 rounded-full bg-black/50 hover:bg-rose-600/80 text-white transition-colors shadow-lg backdrop-blur-sm"
                                      title="Close details"
                                    >
                                      <X className="h-5 w-5" />
                                    </motion.button>
                                  </div>
                                  {selectedPlaceShareMessage && (
                                    <div className="absolute top-16 right-4 z-30 max-w-xs rounded-lg bg-black/65 px-3 py-2 text-[11px] text-white shadow-lg backdrop-blur-sm">
                                      {selectedPlaceShareMessage}
                                    </div>
                                  )}
                                </div>

                                <div className="p-6 space-y-6">
                                  <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.06 }}
                                    className="rounded-2xl border border-rose-100 bg-linear-to-br from-rose-50 to-pink-50 p-4 sm:p-5"
                                  >
                                    {(() => {
                                      return (
                                        <>
                                          <div className="rounded-2xl border border-amber-100 bg-linear-to-br from-amber-50 to-rose-50 p-4 sm:p-5">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                                <span className="p-1.5 rounded-lg bg-amber-100"><Star className="h-4 w-4 text-amber-600" /></span>
                                                Ratings & Reviews
                                              </h3>
                                              <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-0.5">
                                                  {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                      key={star}
                                                      className={`h-4 w-4 ${star <= Math.round(selectedPlaceAverageRating) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                    />
                                                  ))}
                                                </div>
                                                <span className="text-sm font-semibold text-gray-700">
                                                  {selectedPlaceAverageRating > 0 ? selectedPlaceAverageRating.toFixed(1) : 'No rating'}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                  ({selectedPlaceReviewList.length} review{selectedPlaceReviewList.length !== 1 ? 's' : ''})
                                                </span>
                                              </div>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-white/70 bg-white/80 p-3 sm:p-4 space-y-3">
                                              <p className="text-xs font-semibold text-gray-600">Rate, review, and attach photos/videos</p>
                                              <div className="flex items-center gap-1">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                  <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => setReviewRating(star)}
                                                    className="p-1 rounded hover:bg-amber-100 transition-colors"
                                                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                                                  >
                                                    <Star className={`h-5 w-5 ${star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                                                  </button>
                                                ))}
                                                <span className="text-xs text-gray-500 ml-2">
                                                  {reviewRating > 0 ? `${reviewRating}/5 selected` : 'Tap stars to rate'}
                                                </span>
                                              </div>
                                              <input
                                                type="text"
                                                value={reviewInput}
                                                onChange={(e) => setReviewInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') submitPlaceReview(); }}
                                                placeholder="Write your review (optional)..."
                                                className="w-full min-w-0 text-sm text-gray-900 placeholder:text-gray-500 border border-gray-200 rounded-full px-3 py-2 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                              />
                                              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                                <label className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-white border border-rose-200 text-sm font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors">
                                                  <Upload className="h-4 w-4 mr-1.5" />
                                                  Choose Files
                                                  <input
                                                    type="file"
                                                    accept="image/*,video/*"
                                                    multiple
                                                    onChange={handleUserMediaFileChange}
                                                    className="hidden"
                                                  />
                                                </label>
                                              </div>
                                              <p className="text-[11px] text-gray-500">Selected files will be posted with this review text when you tap Post Review.</p>

                                              {userMediaFiles.length > 0 && (
                                                <div>
                                                  <p className="text-xs text-gray-600 mb-2">{userMediaFiles.length} file{userMediaFiles.length > 1 ? 's' : ''} selected</p>
                                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {userMediaFiles.map((item, index) => (
                                                      <motion.div
                                                        key={`${item.file.name}-${index}`}
                                                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        whileHover={{ y: -2, scale: 1.02 }}
                                                        transition={{ duration: 0.25, delay: index * 0.04 }}
                                                        className="group rounded-xl overflow-hidden border border-rose-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                                                      >
                                                        {item.file.type.startsWith('video/') ? (
                                                          <video src={item.preview} className="h-24 w-full object-cover bg-black transition-transform duration-500 group-hover:scale-[1.03]" controls playsInline preload="metadata" />
                                                        ) : (
                                                          <img src={item.preview} alt="Selected media preview" className="w-full h-24 object-cover" />
                                                        )}
                                                      </motion.div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}

                                              {userMediaError && <p className="text-xs text-red-600">{userMediaError}</p>}

                                              <div className="pt-1">
                                                <button
                                                  type="button"
                                                  onClick={submitPlaceReview}
                                                  disabled={reviewSubmitting || userMediaUploading || reviewRating === 0}
                                                  className="w-full sm:w-auto px-4 py-2 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                                                >
                                                  {reviewSubmitting || userMediaUploading ? 'Posting...' : 'Post Review + Media'}
                                                </button>
                                              </div>
                                            </div>

                                            <div className="mt-4 space-y-2 max-h-52 overflow-y-auto pr-1">
                                              {selectedPlaceReviewList.length === 0 && (
                                                <p className="text-xs text-gray-500 text-center py-2">No reviews yet. Be the first to rate this place.</p>
                                              )}
                                              {selectedPlaceReviewList.map((review) => {
                                                const reviewCommentList = reviewComments[review.id] ?? [];
                                                const reviewCommentsOpen = openReviewCommentReviewId === review.id;
                                                const reviewAvatarUrl = userAvatarMap[review.userId] || review.avatarUrl || '';

                                                return (
                                                  <div key={review.id} className="rounded-xl border border-white/80 bg-white/90 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6 border border-rose-100">
                                                          <AvatarImage src={reviewAvatarUrl} alt={review.author} />
                                                          <AvatarFallback className="bg-rose-100 text-rose-600 text-[10px] font-bold uppercase">
                                                            {review.author?.[0] ?? '?'}
                                                          </AvatarFallback>
                                                        </Avatar>
                                                        <span className="text-xs font-semibold text-gray-700">{review.author}</span>
                                                      </div>
                                                      <span className="text-[10px] text-gray-500">{formatReviewDate(review.createdAt)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-0.5 mt-2">
                                                      {[1, 2, 3, 4, 5].map((star) => (
                                                        <Star
                                                          key={star}
                                                          className={`h-3.5 w-3.5 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                                        />
                                                      ))}
                                                    </div>
                                                    {review.text && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{review.text}</p>}
                                                    {review.media.length > 0 && (
                                                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {review.media.map((media, mediaIdx) => (
                                                          <motion.div
                                                            key={`${review.id}-media-${mediaIdx}`}
                                                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            whileHover={{ y: -2, scale: 1.02 }}
                                                            transition={{ duration: 0.25, delay: mediaIdx * 0.03 }}
                                                            className="group rounded-lg overflow-hidden border border-rose-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                                                          >
                                                            {media.type === 'video' ? (
                                                              <video
                                                                src={media.url}
                                                                poster={media.thumbnail}
                                                                controls
                                                                playsInline
                                                                preload="metadata"
                                                                className="h-24 w-full object-cover bg-black transition-transform duration-500 group-hover:scale-[1.03]"
                                                              />
                                                            ) : (
                                                              <img src={media.url} alt={media.caption ?? 'Review media'} className="w-full h-24 object-cover" loading="lazy" />
                                                            )}
                                                          </motion.div>
                                                        ))}
                                                      </div>
                                                    )}

                                                    <button
                                                      type="button"
                                                      onClick={() => setOpenReviewCommentReviewId(reviewCommentsOpen ? null : review.id)}
                                                      className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-rose-600 transition-colors"
                                                    >
                                                      <MessageCircle className="h-3.5 w-3.5" />
                                                      {reviewCommentList.length > 0
                                                        ? `${reviewCommentList.length} comment${reviewCommentList.length > 1 ? 's' : ''}`
                                                        : 'Add comment'}
                                                    </button>

                                                    <AnimatePresence>
                                                      {reviewCommentsOpen && (
                                                        <motion.div
                                                          key={`${review.id}-comments`}
                                                          initial={{ height: 0, opacity: 0 }}
                                                          animate={{ height: 'auto', opacity: 1 }}
                                                          exit={{ height: 0, opacity: 0 }}
                                                          transition={{ duration: 0.2 }}
                                                          className="overflow-hidden"
                                                        >
                                                          <div className="mt-2 rounded-xl border border-rose-100 bg-rose-50/40 p-2.5">
                                                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                                              {reviewCommentList.length === 0 && (
                                                                <p className="text-[11px] text-gray-500 text-center py-1">No comments yet. Start the discussion.</p>
                                                              )}
                                                              {reviewCommentList.map((comment) => {
                                                                const commentAvatarUrl = userAvatarMap[comment.userId] || comment.avatarUrl || '';

                                                                return (
                                                                  <div key={comment.id} className="rounded-lg border border-white bg-white/90 px-2.5 py-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                      <span className="flex items-center gap-1.5 min-w-0">
                                                                        <Avatar className="h-5 w-5 border border-rose-100">
                                                                          <AvatarImage src={commentAvatarUrl} alt={comment.author} />
                                                                          <AvatarFallback className="bg-rose-100 text-rose-600 text-[9px] font-bold uppercase">
                                                                            {comment.author?.[0] ?? '?'}
                                                                          </AvatarFallback>
                                                                        </Avatar>
                                                                        <span className="text-[10px] font-semibold text-gray-700 truncate">{comment.author}</span>
                                                                      </span>
                                                                      <span className="text-[10px] text-gray-500">{formatReviewDate(comment.createdAt)}</span>
                                                                    </div>
                                                                    <p className="mt-1 text-xs text-gray-600 leading-relaxed">{comment.text}</p>
                                                                  </div>
                                                                );
                                                              })}
                                                            </div>

                                                            <div className="mt-2 flex items-center gap-1.5">
                                                              <input
                                                                type="text"
                                                                value={reviewCommentInputs[review.id] ?? ''}
                                                                onChange={(e) => setReviewCommentInputs((prev) => ({ ...prev, [review.id]: e.target.value }))}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') submitReviewComment(review.id); }}
                                                                placeholder="Write a comment on this review..."
                                                                className="flex-1 min-w-0 text-[11px] text-gray-900 placeholder:text-gray-400 border border-rose-200 rounded-full px-2.5 py-1.5 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                                              />
                                                              <button
                                                                type="button"
                                                                onClick={() => submitReviewComment(review.id)}
                                                                disabled={reviewCommentSubmitting || !(reviewCommentInputs[review.id] ?? '').trim()}
                                                                className="px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-[11px] font-semibold transition-colors"
                                                              >
                                                                {reviewCommentSubmitting ? 'Posting...' : 'Post'}
                                                              </button>
                                                            </div>
                                                          </div>
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </motion.div>

                                  {selectedPlace.description && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                      className="text-gray-700 leading-relaxed text-base [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mb-2 [&_h5]:text-base [&_h5]:font-semibold [&_h6]:mb-2 [&_h6]:text-sm [&_h6]:font-semibold"
                                      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtmlForDisplay(selectedPlace.description) }}
                                    />
                                  )}

                                  {selectedPlace.googleMapsUrl && (
                                    <div className="flex flex-col gap-3">
                                      <a href={selectedPlace.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                                        className="self-start inline-flex items-center gap-2 text-sm font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-full transition-all">
                                        <MapPin className="h-4 w-4" /> View on Google Maps
                                      </a>
                                      <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.12 }}
                                        className="rounded-2xl overflow-hidden shadow-md border border-gray-100"
                                      >
                                        <iframe
                                          title={`Map of ${selectedPlace.name}`}
                                          src={`https://maps.google.com/maps?q=${encodeURIComponent(`${selectedPlace.name}, ${selectedPlace.area}, ${selectedPlace.state}`)}&output=embed`}
                                          width="100%"
                                          height="300"
                                          style={{ border: 0 }}
                                          allowFullScreen
                                          loading="lazy"
                                          referrerPolicy="no-referrer-when-downgrade"
                                          className="w-full"
                                        />
                                      </motion.div>
                                    </div>
                                  )}

                                  {/* Photos */}
                                  {selectedPlaceImages.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                                      <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="p-1.5 rounded-lg bg-rose-100"><ImageIcon className="h-4 w-4 text-rose-600" /></span> Photos
                                      </h3>
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                        {selectedPlaceImages.map((img, i) => {
                                          const ck = `image_${i}`;
                                          const cList = mediaComments[ck] ?? [];
                                          const isOpen = openCommentKey === ck;
                                          return (
                                            <div key={i} className={`flex flex-col rounded-xl overflow-hidden shadow-md bg-white border transition-all ${!dpHasVideo && i === detailBannerImgIdx ? 'border-rose-400 ring-1 ring-rose-400' : 'border-gray-100'}`}>
                                              <motion.div
                                                initial={{ opacity: 0, scale: 0.85 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.05 * i }}
                                                className="group relative aspect-square overflow-hidden cursor-pointer"
                                                onClick={() => { setSelectedPlaceMediaIdx(i); if (!dpHasVideo) setDetailBannerImgIdx(i); }}
                                              >
                                                <img src={img.url} alt={img.caption ?? ''} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                                                {img.caption && (
                                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1.5 py-1 truncate">{img.caption}</div>
                                                )}
                                                {!dpHasVideo && i === detailBannerImgIdx && (
                                                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center shadow">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                  </div>
                                                )}
                                              </motion.div>
                                              <button
                                                onClick={() => setOpenCommentKey(isOpen ? null : ck)}
                                                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:text-rose-500 transition-colors border-t border-gray-50"
                                              >
                                                <MessageCircle className="h-3.5 w-3.5" />
                                                {cList.length > 0 ? `${cList.length} comment${cList.length > 1 ? 's' : ''}` : 'Add comment'}
                                              </button>
                                              <AnimatePresence>
                                                {isOpen && (
                                                  <motion.div
                                                    key="comments"
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.22 }}
                                                    className="overflow-hidden border-t border-gray-100"
                                                  >
                                                    <div className="p-2 space-y-1.5 max-h-36 overflow-y-auto">
                                                      {cList.length === 0 && <p className="text-[10px] text-gray-400 text-center py-1">No comments yet</p>}
                                                      {cList.map(c => (
                                                        <div key={c.id} className="flex gap-1.5">
                                                          <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 text-[9px] font-bold flex items-center justify-center shrink-0 uppercase">{c.author?.[0] ?? '?'}</span>
                                                          <div>
                                                            <span className="text-[9px] font-semibold text-gray-700">{c.author} </span>
                                                            <span className="text-[10px] text-gray-600">{c.text}</span>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div className="flex gap-1.5 p-2 border-t border-gray-50 items-center">
                                                      <input
                                                        type="text"
                                                        value={commentInputs[ck] ?? ''}
                                                        onChange={e => setCommentInputs(prev => ({ ...prev, [ck]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') submitMediaComment(ck); }}
                                                        placeholder="Write a comment..."
                                                        className="flex-1 min-w-0 text-[11px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-full px-2.5 py-1 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                                      />
                                                      <button
                                                        onClick={() => submitMediaComment(ck)}
                                                        disabled={commentSubmitting || !(commentInputs[ck]?.trim())}
                                                        className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 flex items-center justify-center text-white shrink-0 transition-colors"
                                                      >
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                      </button>
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}

                                  {/* Videos */}
                                  {selectedPlaceVideos.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                      <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                                        <span className="p-1.5 rounded-lg bg-rose-100"><Video className="h-4 w-4 text-rose-600" /></span> Videos
                                      </h3>
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                        {selectedPlaceVideos.map((vid, i) => {
                                          const ck = `video_${i}`;
                                          const cList = mediaComments[ck] ?? [];
                                          const isOpen = openCommentKey === ck;
                                          return (
                                            <div key={i} className={`group flex flex-col rounded-2xl overflow-hidden bg-zinc-900/95 border transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.35)] hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(244,63,94,0.25)] ${dpHasVideo && i === detailVidIdx ? 'border-rose-400 ring-1 ring-rose-400' : 'border-transparent'}`}>
                                              <motion.div
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.05 * i }}
                                                whileHover={{ scale: 1.015 }}
                                                className="relative aspect-video bg-black cursor-pointer overflow-hidden"
                                                onClick={() => {
                                                  setDetailVidIdx(i);
                                                  setDetailVidPaused(false);
                                                  setTimeout(() => detailBannerVidRef.current?.play(), 80);
                                                }}
                                              >
                                                <video
                                                  src={vid.url}
                                                  poster={vid.thumbnail}
                                                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                                                  controls
                                                  playsInline
                                                  preload="metadata"
                                                />
                                                <motion.div
                                                  className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/35 via-transparent to-transparent"
                                                  animate={{ opacity: [0.45, 0.22, 0.45] }}
                                                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                                {dpHasVideo && i === detailVidIdx && (
                                                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center shadow">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                  </div>
                                                )}
                                                {vid.caption && (
                                                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-2 py-1 truncate">{vid.caption}</div>
                                                )}
                                              </motion.div>
                                              <button
                                                onClick={() => setOpenCommentKey(isOpen ? null : ck)}
                                                className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-300 hover:text-rose-400 transition-colors border-t border-zinc-700"
                                              >
                                                <MessageCircle className="h-3.5 w-3.5" />
                                                {cList.length > 0 ? `${cList.length} comment${cList.length > 1 ? 's' : ''}` : 'Add comment'}
                                              </button>
                                              <AnimatePresence>
                                                {isOpen && (
                                                  <motion.div
                                                    key="comments"
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.22 }}
                                                    className="overflow-hidden border-t border-zinc-700"
                                                  >
                                                    <div className="p-2 space-y-1.5 max-h-36 overflow-y-auto">
                                                      {cList.length === 0 && <p className="text-[10px] text-zinc-500 text-center py-1">No comments yet</p>}
                                                      {cList.map(c => (
                                                        <div key={c.id} className="flex gap-1.5">
                                                          <span className="w-5 h-5 rounded-full bg-rose-900/60 text-rose-400 text-[9px] font-bold flex items-center justify-center shrink-0 uppercase">{c.author?.[0] ?? '?'}</span>
                                                          <div>
                                                            <span className="text-[9px] font-semibold text-zinc-300">{c.author} </span>
                                                            <span className="text-[10px] text-zinc-400">{c.text}</span>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                    <div className="flex gap-1.5 p-2 border-t border-zinc-700 items-center">
                                                      <input
                                                        type="text"
                                                        value={commentInputs[ck] ?? ''}
                                                        onChange={e => setCommentInputs(prev => ({ ...prev, [ck]: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') submitMediaComment(ck); }}
                                                        placeholder="Write a comment..."
                                                        className="flex-1 min-w-0 text-[11px] bg-white border border-zinc-300 rounded-full px-2.5 py-1 text-gray-900 placeholder:text-gray-400 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                                      />
                                                      <button
                                                        onClick={() => submitMediaComment(ck)}
                                                        disabled={commentSubmitting || !(commentInputs[ck]?.trim())}
                                                        className="w-7 h-7 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 flex items-center justify-center text-white shrink-0 transition-colors"
                                                      >
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                      </button>
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}

                                  {/* Extra Info */}
                                  {selectedPlace.extraInfo?.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="space-y-3">
                                      {selectedPlace.extraInfo.map((info, i) => (
                                        <motion.div
                                          key={i}
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: 0.08 * i }}
                                          className="bg-linear-to-br from-rose-50 to-pink-50 rounded-2xl p-5 border border-rose-100"
                                        >
                                          {info.heading && <h4 className="font-bold text-rose-700 text-sm mb-1.5">{info.heading}</h4>}
                                          {info.description && <p className="text-gray-700 text-sm leading-relaxed">{info.description}</p>}
                                        </motion.div>
                                      ))}
                                    </motion.div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </motion.div>
                      )}
                    </AnimatePresence>


                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Communities Section - Hidden when category is selected */}
        {!selectedCategory && (
          <>
            {/* Header */}
            <motion.div
              ref={communityRoomsRef}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-12"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 p-5 sm:p-8 rounded-3xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 shadow-xl">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-3 rounded-2xl bg-linear-to-br from-rose-500 to-pink-600 shadow-lg">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold bg-linear-to-r from-rose-600 to-pink-500 dark:from-rose-400 dark:to-pink-400 bg-clip-text text-transparent">
                      Communities
                    </h1>
                  </div>
                  <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 ml-1">
                    Connect, share, and explore with fellow travelers ??
                  </p>
                  {user && (
                    <div className="flex items-center gap-2 mt-3 ml-1">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-linear-to-r from-rose-500/10 to-pink-500/10 dark:from-rose-400/10 dark:to-pink-400/10 border border-rose-500/20 dark:border-rose-400/20">
                        <Crown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                          {paidMember
                            ? `Private Community Creation: ${userCreatedPrivateRoomsCount}/${Number.isFinite(privateRoomAllowance.maxAllowed) ? privateRoomAllowance.maxAllowed : 'Unlimited'} (Joining is unlimited)`
                            : 'Private Community Creation Locked (Pro Plan Required). Joining is unlimited.'
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <Dialog
                  open={showCreateDialog}
                  onOpenChange={(open) => {
                    setCreateRoomError('');
                    setShowCreateDialog(canCreatePrivateCommunity ? open : false);
                  }}
                >
                  {canCreatePrivateCommunity ? (
                    <DialogTrigger asChild>
                      <Button
                        size="lg"
                        className="w-full sm:w-auto bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-5 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold"
                      >
                        <Plus className="h-6 w-6 mr-2" />
                        Create New Community
                      </Button>
                    </DialogTrigger>
                  ) : (
                    <Button
                      size="lg"
                      onClick={() => router.push('/pricing')}
                      className="w-full sm:w-auto bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-5 sm:px-8 py-4 sm:py-6 text-base sm:text-lg font-semibold"
                    >
                      <Plus className="h-6 w-6 mr-2" />
                      Subscribe Now
                    </Button>
                  )}
                  <DialogContent className="w-[95vw] sm:max-w-137.5 max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-bold bg-linear-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent">
                        Create New Community Chat
                      </DialogTitle>
                      <DialogDescription className="text-base">
                        Create a private community chat for your members.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateRoom} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="roomName" className="text-sm font-semibold">Community Name</Label>
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
                          placeholder="What's this community about?"
                          value={newRoomDescription}
                          onChange={(e) => setNewRoomDescription(e.target.value)}
                          className="h-12 rounded-xl border-2 focus:border-primary"
                        />
                      </div>
                      {!newRoomIsPublic && (
                        <div className="space-y-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Private Group Policy</p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {privateRoomAllowance.reason}
                          </p>

                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Community Visibility</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setNewPrivateVisibility('private')}
                                className={`rounded-xl border px-3 py-2 text-left transition-colors ${newPrivateVisibility === 'private'
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                                  }`}
                              >
                                <p className="text-sm font-semibold">Private</p>
                                <p className="text-xs">Hidden from community listing</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewPrivateVisibility('exposed')}
                                className={`rounded-xl border px-3 py-2 text-left transition-colors ${newPrivateVisibility === 'exposed'
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                                  }`}
                              >
                                <p className="text-sm font-semibold">Exposed</p>
                                <p className="text-xs">Visible in community, users can request to join</p>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {!newRoomIsPublic && (
                        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
                          <Shield className="h-4 w-4 mt-0.5" />
                          Private communities do not use passwords. Access is controlled by invite links or admin-approved join requests.
                        </div>
                      )}

                      {/* Background Image Upload */}
                      <div className="space-y-2">
                        <Label htmlFor="backgroundImage" className="text-sm font-semibold flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-primary" />
                          Community Background Image (Optional)
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
                          Community Icon (Optional)
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
                        className="w-full h-12 rounded-xl bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white font-semibold shadow-lg"
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
                            Create Community
                          </>
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={Boolean(createRoomError)}
                  onOpenChange={(open) => {
                    if (!open) setCreateRoomError('');
                  }}
                >
                  <DialogContent className="w-[92vw] max-w-md rounded-2xl border border-red-400/40 bg-background p-0 overflow-hidden">
                    <DialogHeader className="sr-only">
                      <DialogTitle>Unable to create community</DialogTitle>
                      <DialogDescription>{createRoomError || 'Community creation failed.'}</DialogDescription>
                    </DialogHeader>
                    <div className="bg-linear-to-r from-red-600/10 via-rose-600/10 to-pink-600/10 p-5">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-foreground">Unable to create community</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{createRoomError}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                        {!paidMember && (
                          <Button
                            type="button"
                            onClick={() => {
                              setCreateRoomError('');
                              router.push('/pricing?source=private-community');
                            }}
                            className="bg-linear-to-r from-rose-600 to-pink-600 text-white hover:from-rose-700 hover:to-pink-700"
                          >
                            Upgrade Plan
                          </Button>
                        )}
                        <Button type="button" variant="outline" onClick={() => setCreateRoomError('')}>
                          Close
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </motion.div>

            {!user && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="mb-8 rounded-3xl border border-rose-200/70 dark:border-rose-800/40 bg-linear-to-r from-rose-50 via-white to-orange-50 dark:from-rose-950/40 dark:via-slate-900/60 dark:to-orange-950/30 p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/60 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      <Lock className="h-3.5 w-3.5" />
                      Login required
                    </div>
                    <h2 className="mt-3 text-2xl font-bold text-foreground">
                      Sign in to chat in General Community Chat
                    </h2>
                    <p className="mt-2 text-sm sm:text-base text-muted-foreground">
                      The live community rooms are protected, so you need to log in before you can join the General Community Chat or see private communities.
                    </p>
                  </div>
                  <Button asChild className="rounded-xl bg-linear-to-r from-rose-600 to-pink-600 text-white font-semibold shadow-lg hover:from-rose-700 hover:to-pink-700">
                    <a href="/auth?redirect=%2Fchat">Login to Chat</a>
                  </Button>
                </div>
              </motion.div>
            )}

            {countryUsersCarousel}

            {/* Rooms Grid */}
            {user && rooms.length === 0 ? (
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
                        <div className="absolute inset-0 bg-linear-to-r from-rose-400 to-pink-400 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                        <div className="relative p-6 rounded-full bg-linear-to-br from-rose-100 to-pink-100 dark:from-rose-900/40 dark:to-pink-900/40">
                          <MessageCircle className="h-16 w-16 text-rose-600 dark:text-rose-400" />
                        </div>
                      </div>
                    </motion.div>
                    <h3 className="text-2xl font-bold mb-3 bg-linear-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent">
                      No Communities Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                      Be the first to create a community and start connecting! ?
                    </p>
                    <Button
                      onClick={() => setShowCreateDialog(true)}
                      className="bg-linear-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl px-8 py-6 text-lg font-semibold"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Create First Community
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="space-y-8">
                {/* Public Rooms Section */}
                {publicRooms.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-xl bg-linear-to-br from-green-500 to-emerald-600 shadow-lg">
                        <Compass className="h-6 w-6 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold bg-linear-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">
                        General Community Chat
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        Anyone can join without a password
                      </span>
                    </div>
                    <motion.div
                      className="max-h-136 overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:rgba(34,197,94,0.55)_transparent] grid grid-cols-1 gap-6"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <AnimatePresence mode="popLayout">
                        {publicRooms.map((room, index) => (
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
                              className="cursor-pointer h-full bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 shadow-xl hover:shadow-2xl hover:border-primary/50 transition-all duration-300 rounded-3xl overflow-hidden group relative"
                              onClick={() => router.push(`/community/room/${room.id}`)}
                            >
                              {/* Sliding Background Images Carousel */}
                              {(() => {
                                const allImages = [
                                  ...(room.backgroundImage ? [room.backgroundImage] : []),
                                  ...(room.backgroundImageHistory || [])
                                ];

                                return allImages.length > 0 ? (
                                  <div className="absolute inset-0 overflow-hidden z-0">
                                    <Swiper
                                      modules={[Autoplay, EffectFade]}
                                      effect="fade"
                                      autoplay={shouldAutoplayRichMedia ? {
                                        delay: 3000,
                                        disableOnInteraction: false,
                                        pauseOnMouseEnter: false
                                      } : false}
                                      loop={allImages.length > 2}
                                      speed={1500}
                                      className="h-full w-full"
                                      allowTouchMove={false}
                                    >
                                      {allImages.map((image, idx) => (
                                        <SwiperSlide key={`${image.url}-${idx}`}>
                                          <div
                                            className="absolute inset-0"
                                            style={{
                                              backgroundImage: `url(${image.url})`,
                                              backgroundSize: 'cover',
                                              backgroundPosition: 'center',
                                              backgroundRepeat: 'no-repeat'
                                            }}
                                          />
                                        </SwiperSlide>
                                      ))}
                                    </Swiper>
                                  </div>
                                ) : null;
                              })()}

                              {/* Gradient overlay on hover */}
                              <div className="absolute inset-0 bg-linear-to-br from-rose-500/0 via-pink-500/0 to-red-500/0 group-hover:from-rose-500/10 group-hover:via-pink-500/10 group-hover:to-red-500/10 transition-all duration-300 z-2 pointer-events-none"></div>
                              {room.backgroundImage?.url && room.iconImage?.url && (
                                <div className="absolute inset-0 bg-black/35 backdrop-brightness-75 z-2 pointer-events-none" />
                              )}

                              <CardHeader className="relative z-10">
                                <CardTitle
                                  className={`flex items-center gap-2.5 text-xl font-bold ${room.backgroundImage?.url && room.iconImage?.url
                                      ? 'text-slate-50'
                                      : 'text-gray-900 dark:text-white'
                                    }`}
                                  style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 12px rgba(0,0,0,0.65)' : 'none' }}
                                >
                                  {/* Room Icon */}
                                  {room.iconImage ? (
                                    <Avatar className="h-10 w-10 border-2 border-white/50 shadow-lg" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                                      <AvatarImage src={room.iconImage.url} alt={room.name} />
                                      <AvatarFallback>{room.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <div className="p-2 rounded-xl bg-linear-to-br from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-700 shadow-lg border border-rose-400 dark:border-rose-500" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                                      <MessageCircle className="h-5 w-5 text-white" />
                                    </div>
                                  )}
                                  <span
                                    className={`flex-1 truncate transition-colors font-bold ${room.backgroundImage?.url && room.iconImage?.url
                                        ? 'group-hover:text-white'
                                        : 'group-hover:text-rose-600 dark:group-hover:text-rose-300'
                                      }`}
                                  >
                                    {room.name}
                                  </span>
                                </CardTitle>
                                <CardDescription
                                  className={`text-base mt-2 font-medium ${room.backgroundImage?.url && room.iconImage?.url
                                      ? 'text-slate-100'
                                      : 'text-gray-800 dark:text-white'
                                    }`}
                                  style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 10px rgba(0,0,0,0.6)' : 'none' }}
                                >
                                  {room.description}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="relative z-10">
                                <div className="space-y-3 text-sm">
                                  <div
                                    className={`flex items-center gap-2.5 ${room.backgroundImage?.url && room.iconImage?.url
                                        ? 'text-slate-50'
                                        : 'text-gray-900 dark:text-white'
                                      }`}
                                  >
                                    <div className="p-1.5 rounded-lg bg-rose-500/30 backdrop-blur-sm">
                                      <Users className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }} />
                                    </div>
                                    <span className="font-semibold" style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 8px rgba(0,0,0,0.55)' : 'none' }}>{room.participants?.length || 0} participants</span>
                                  </div>
                                  <div
                                    className={`flex items-center gap-2.5 ${room.backgroundImage?.url && room.iconImage?.url
                                        ? 'text-slate-50'
                                        : 'text-gray-900 dark:text-white'
                                      }`}
                                  >
                                    <div className="p-1.5 rounded-lg bg-pink-500/30 backdrop-blur-sm">
                                      <Clock className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }} />
                                    </div>
                                    <span className="font-semibold" style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 8px rgba(0,0,0,0.55)' : 'none' }}>Created {formatDate(room.createdAt)}</span>
                                  </div>
                                </div>

                                {/* Action buttons */}
                                {user && (
                                  <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-300 dark:border-white/30">
                                    <Button
                                      size="sm"
                                      className={`rounded-xl font-semibold ${room.backgroundImage?.url && room.iconImage?.url
                                          ? 'border border-white/60 bg-white/20 text-slate-50 backdrop-blur-md shadow-[0_0_22px_rgba(255,255,255,0.25)] hover:bg-white/30 hover:text-white hover:shadow-[0_0_30px_rgba(255,255,255,0.38)]'
                                          : 'bg-linear-to-r from-rose-600 to-pink-600 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:from-rose-700 hover:to-pink-700 hover:shadow-[0_0_26px_rgba(244,63,94,0.65)] pulse-glow'
                                        }`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/community/room/${room.id}`);
                                      }}
                                    >
                                      <MessageCircle className="h-4 w-4 mr-1.5" />
                                      Chat Now
                                    </Button>
                                    {((room.isPublic && isAdminOrOwner) || (!room.isPublic && room.createdBy === user.uid)) &&
                                      !((room.name || '').trim().toLowerCase() === 'general community chat' ||
                                        (room.name || '').trim().toLowerCase() === 'general chat' ||
                                        (room.name || '').trim().toLowerCase().startsWith('general chat') ||
                                        (room.name || '').trim().toLowerCase().includes('general community')) && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="rounded-xl border-2 border-red-400 dark:border-red-400/50 bg-red-200 dark:bg-red-500/30 backdrop-blur-sm text-gray-900 dark:text-white hover:bg-red-300 dark:hover:bg-red-500/50 hover:border-red-500 dark:hover:border-red-300 transition-all font-semibold"
                                          onClick={(e) => handleDeleteRoom(room.id!, e)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                )}

                {searchDestination === '__legacy_country_users__' && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                    className="overflow-hidden rounded-3xl border border-cyan-200/60 dark:border-cyan-800/40 bg-linear-to-r from-cyan-100/70 via-white/70 to-blue-100/70 dark:from-cyan-950/45 dark:via-slate-900/55 dark:to-blue-950/45 backdrop-blur-xl shadow-[0_18px_50px_-20px_rgba(14,116,144,0.55)]"
                  >
                    <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
                      <div className="flex items-center gap-3">
                        <motion.div
                          className="p-2.5 rounded-2xl bg-linear-to-br from-cyan-500 to-blue-600 shadow-lg"
                          animate={{ rotate: [-3, 3, -3] }}
                          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <Users className="h-5 w-5 text-white" />
                        </motion.div>
                        <div>
                          <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-linear-to-r from-cyan-700 via-sky-600 to-blue-600 bg-clip-text text-transparent">
                            Travelers From Different Countries
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            Live user highlights pulled from database profiles
                          </p>
                        </div>
                      </div>

                      <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-cyan-300/70 dark:border-cyan-700/60 bg-white/65 dark:bg-slate-900/65 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                        Live carousel
                      </div>
                    </div>

                    <div className="relative overflow-hidden rounded-b-3xl border-t border-cyan-200/70 dark:border-cyan-800/45 bg-linear-to-b from-cyan-100/30 via-white/70 to-cyan-100/55 dark:from-cyan-950/20 dark:via-slate-900/70 dark:to-blue-950/35 px-4 sm:px-5 pt-3 pb-6">
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-linear-to-r from-cyan-100/95 via-white/90 to-transparent dark:from-slate-900 dark:via-slate-900/90" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-linear-to-l from-cyan-100/95 via-white/90 to-transparent dark:from-slate-900 dark:via-slate-900/90" />

                      <motion.div
                        className="flex w-max items-center gap-8 px-4"
                        animate={{ x: ['0%', '-50%'] }}
                        transition={{
                          duration: Math.max(26, countryUsers.length * 2),
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                      >
                        {[...countryUsers, ...countryUsers].map((countryUser, index) => {
                          const fallbackLetter = (countryUser.name[0] || countryUser.username[0] || 'U').toUpperCase();
                          const avatarSrc = resolveAvatarUrl(countryUser as Record<string, unknown>) || undefined;
                          return (
                            <motion.div
                              key={`${countryUser.id}-${countryUser.country}-${index}`}
                              className="relative flex shrink-0 min-w-72 items-center gap-4 rounded-2xl border border-cyan-200/70 dark:border-cyan-700/50 bg-white/88 dark:bg-slate-900/72 px-4 py-3 shadow-[0_12px_32px_-18px_rgba(14,116,144,0.65)]"
                              initial={{ opacity: 0.85, y: 4 }}
                              animate={{ opacity: 1, y: [0, -4, 0] }}
                              transition={{
                                opacity: { duration: 0.35 },
                                y: {
                                  duration: 3.2,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: (index % Math.max(1, countryUsers.length)) * 0.08,
                                },
                              }}
                              whileHover={{ y: -8, scale: 1.02, transition: { duration: 0.2 } }}
                            >
                              <div className="absolute inset-0 rounded-2xl bg-linear-to-r from-cyan-500/0 via-cyan-500/5 to-blue-500/10 pointer-events-none" />

                              <Avatar className="h-14 w-14 border-2 border-cyan-300/80 dark:border-cyan-600/70 shadow-md shrink-0">
                                <AvatarImage src={avatarSrc} alt={countryUser.name} className="object-cover" />
                                <AvatarFallback className="bg-linear-to-br from-cyan-500 to-blue-600 text-white text-sm font-bold">
                                  {fallbackLetter}
                                </AvatarFallback>
                              </Avatar>

                              <div className="min-w-0 relative z-10">
                                <p className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {countryUser.name}
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-300 truncate">
                                  @{countryUser.username}
                                </p>
                                <p className="text-sm text-yellow-700 dark:text-yellow-300 inline-flex items-center gap-1.5 truncate font-semibold mt-0.5">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-yellow-600 dark:text-yellow-300" />
                                  <motion.span
                                    className="truncate"
                                    animate={{ opacity: [1, 0.45, 1], scale: [1, 1.03, 1] }}
                                    transition={{
                                      duration: 0.95,
                                      repeat: Infinity,
                                      ease: 'easeInOut',
                                      delay: (index % Math.max(1, countryUsers.length)) * 0.04,
                                    }}
                                  >
                                    {countryUser.country}
                                  </motion.span>
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {/* Private Rooms Section */}
                {(myPrivateRooms.length > 0 || friendsPrivateRooms.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="relative mb-8 py-4">
                      {/* Small Glowing Header */}
                      <motion.div
                        className="relative z-10 text-center mb-4"
                      >
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <motion.div
                            animate={{
                              boxShadow: [
                                '0 0 10px rgba(168, 85, 247, 0.5)',
                                '0 0 20px rgba(168, 85, 247, 0.8)',
                                '0 0 10px rgba(168, 85, 247, 0.5)'
                              ]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="p-2 rounded-lg bg-linear-to-br from-purple-500 to-pink-500"
                          >
                            <Lock className="h-5 w-5 text-white" />
                          </motion.div>
                          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
                            Private Community Chat
                          </h2>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                          🔐 Exposed • 🚫 Private
                        </p>
                      </motion.div>

                      {/* Compact Search Bar with Glow */}
                      <motion.div
                        className="relative z-10 flex justify-center mb-4"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                      >
                        <div className="w-full max-w-md px-4 sm:px-0">
                          <motion.div
                            animate={{
                              boxShadow: [
                                '0 0 20px rgba(236, 72, 145, 0.6), 0 0 40px rgba(168, 85, 247, 0.4)',
                                '0 0 35px rgba(236, 72, 145, 0.8), 0 0 60px rgba(168, 85, 247, 0.6)',
                                '0 0 20px rgba(236, 72, 145, 0.6), 0 0 40px rgba(168, 85, 247, 0.4)'
                              ]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="relative bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 flex items-center gap-2 border-2 border-pink-400 dark:border-pink-500 shadow-lg"
                          >
                            <Search className="h-5 w-5 text-pink-500 dark:text-pink-400 font-semibold" />
                            <Input
                              placeholder="Search communities..."
                              value={privateCommunitySearch}
                              onChange={(e) => setPrivateCommunitySearch(e.target.value)}
                              className="h-full text-sm bg-transparent border-0 focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-0 font-medium"
                            />
                            {privateCommunitySearch && (
                              <motion.button
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                onClick={() => setPrivateCommunitySearch('')}
                                className="p-1 hover:bg-pink-100 dark:hover:bg-pink-950/40 rounded transition-colors"
                              >
                                <X className="h-5 w-5 text-pink-500 dark:text-pink-400 hover:text-pink-600 dark:hover:text-pink-300" />
                              </motion.button>
                            )}
                          </motion.div>
                        </div>
                      </motion.div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {[
                        {
                          key: 'my-private-community',
                          title: 'My Private Community',
                          rooms: myPrivateRooms,
                          emptyMessage: 'You have not created any private communities yet.',
                        },
                        {
                          key: 'friends-private-community',
                          title: 'Friends Private Community',
                          rooms: friendsPrivateRooms,
                          emptyMessage: 'No friends private communities available yet.',
                        },
                      ].map((section, sectionIndex) => (
                        <motion.div
                          key={section.key}
                          className="relative space-y-4 rounded-3xl border border-amber-300/50 dark:border-amber-700/50 bg-linear-to-br from-white/55 via-amber-50/35 to-rose-100/25 dark:from-slate-900/55 dark:via-amber-950/15 dark:to-rose-950/10 p-4 sm:p-5 shadow-[0_20px_45px_-28px_rgba(245,158,11,0.55)]"
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.45, delay: sectionIndex * 0.08 }}
                        >
                          <motion.div
                            className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-linear-to-br from-amber-400/25 to-rose-400/20 blur-3xl"
                            animate={{ scale: [1, 1.1, 1], opacity: [0.55, 0.8, 0.55] }}
                            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: sectionIndex * 0.4 }}
                          />
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="relative z-10 text-xl sm:text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                              {section.title}
                            </h3>
                            <span className="relative z-10 text-xs sm:text-sm rounded-full border border-amber-300/70 dark:border-amber-700/70 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-300 bg-white/70 dark:bg-slate-900/70 shadow-sm">
                              {filterPrivateCommunityRooms(section.rooms).length} {filterPrivateCommunityRooms(section.rooms).length === 1 ? 'community' : 'communities'}
                            </span>
                          </div>

                          {filterPrivateCommunityRooms(section.rooms).length === 0 ? (
                            <div className="relative z-10 rounded-2xl border border-dashed border-amber-300/70 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-5 text-sm text-amber-700 dark:text-amber-300">
                              {normalizedPrivateCommunitySearch
                                ? `No private communities found for "${privateCommunitySearch.trim()}".`
                                : section.emptyMessage}
                            </div>
                          ) : (
                            <div className="relative z-10 overflow-visible pr-2">
                              <motion.div
                                className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-6 pb-1"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5 }}
                              >
                                <AnimatePresence mode="popLayout">
                                  {filterPrivateCommunityRooms(section.rooms).map((room, index) => (
                                    <motion.div
                                      key={room.id}
                                      initial={{ opacity: 0, y: 20 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.9 }}
                                      transition={{ delay: index * 0.05 }}
                                      whileHover={{ y: -10, transition: { duration: 0.2 } }}
                                      layout
                                    >
                                      {(() => {
                                        const ownerProfile = room.createdBy ? communityOwnerMap[room.createdBy] : undefined;
                                        const ownerName = ownerProfile?.displayName || (room.createdBy ? `User ${room.createdBy.slice(0, 6)}` : 'Community Owner');
                                        const ownerAvatar = ownerProfile?.avatarUrl || '';
                                        const ownerInitial = (ownerName.charAt(0) || 'U').toUpperCase();

                                        return (
                                          <Card
                                            className={`cursor-pointer h-full min-h-96 border-2 shadow-lg hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden group relative ${room.visibility === 'exposed'
                                                ? 'border-green-400/80 dark:border-green-500/80 shadow-[0_0_0_1px_rgba(34,197,94,0.20),0_0_22px_rgba(34,197,94,0.22)] hover:border-green-300'
                                                : 'border-blue-400/80 dark:border-blue-500/80 shadow-[0_0_0_1px_rgba(59,130,246,0.20),0_0_22px_rgba(59,130,246,0.22)] hover:border-blue-300'
                                              }`}
                                            onClick={() => router.push(`/community/room/${room.id}`)}
                                          >
                                            {/* Sliding Background Images Carousel */}
                                            {(() => {
                                              const allImages = [
                                                ...(room.backgroundImage ? [room.backgroundImage] : []),
                                                ...(room.backgroundImageHistory || [])
                                              ];

                                              return allImages.length > 0 ? (
                                                <div className="absolute inset-0 overflow-hidden z-0">
                                                  <Swiper
                                                    modules={[Autoplay, EffectFade]}
                                                    effect="fade"
                                                    autoplay={shouldAutoplayRichMedia ? {
                                                      delay: 3000,
                                                      disableOnInteraction: false,
                                                      pauseOnMouseEnter: false
                                                    } : false}
                                                    loop={allImages.length > 2}
                                                    speed={1500}
                                                    className="h-full w-full"
                                                    allowTouchMove={false}
                                                  >
                                                    {allImages.map((image, idx) => (
                                                      <SwiperSlide key={`${image.url}-${idx}`}>
                                                        <div
                                                          className="absolute inset-0"
                                                          style={{
                                                            backgroundImage: `url(${image.url})`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center',
                                                            backgroundRepeat: 'no-repeat'
                                                          }}
                                                        />
                                                      </SwiperSlide>
                                                    ))}
                                                  </Swiper>
                                                </div>
                                              ) : null;
                                            })()}

                                            {/* Gradient overlay on hover */}
                                            <div className="absolute inset-0 bg-linear-to-br from-rose-500/0 via-pink-500/0 to-red-500/0 group-hover:from-rose-500/10 group-hover:via-pink-500/10 group-hover:to-red-500/10 transition-all duration-300 z-2 pointer-events-none"></div>
                                            <motion.div
                                              aria-hidden="true"
                                              className={`absolute inset-0 rounded-2xl border-2 pointer-events-none z-30 ${room.visibility === 'exposed'
                                                  ? 'border-green-400/70 dark:border-green-400/80'
                                                  : 'border-blue-400/70 dark:border-blue-400/80'
                                                }`}
                                              animate={{ opacity: [0.35, 1, 0.35] }}
                                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                            />
                                            <motion.div
                                              className={`pointer-events-none absolute top-2 left-2 z-40 flex items-center gap-2 rounded-full border px-2.5 py-1.5 backdrop-blur-md max-w-46 ${room.visibility === 'exposed'
                                                  ? 'border-green-300/80 bg-green-100/85 dark:border-green-500/70 dark:bg-green-950/55'
                                                  : 'border-blue-300/80 bg-blue-100/85 dark:border-blue-500/70 dark:bg-blue-950/55'
                                                }`}
                                              animate={{
                                                boxShadow:
                                                  room.visibility === 'exposed'
                                                    ? [
                                                      '0 0 0 rgba(34,197,94,0)',
                                                      '0 0 18px rgba(34,197,94,0.65)',
                                                      '0 0 0 rgba(34,197,94,0)',
                                                    ]
                                                    : [
                                                      '0 0 0 rgba(59,130,246,0)',
                                                      '0 0 18px rgba(59,130,246,0.65)',
                                                      '0 0 0 rgba(59,130,246,0)',
                                                    ],
                                              }}
                                              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                            >
                                              <div className="relative shrink-0">
                                                <motion.div
                                                  aria-hidden="true"
                                                  className={`absolute inset-0 rounded-full ${room.visibility === 'exposed' ? 'bg-green-400/45' : 'bg-blue-400/45'
                                                    }`}
                                                  animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                                                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                                />
                                                <Avatar className="relative h-8 w-8 border-2 border-white/80 dark:border-white/50 shadow-sm">
                                                  <AvatarImage src={ownerAvatar} alt={ownerName} />
                                                  <AvatarFallback className="text-[11px] font-bold uppercase bg-linear-to-br from-amber-500 to-rose-600 text-white">
                                                    {ownerInitial}
                                                  </AvatarFallback>
                                                </Avatar>
                                              </div>
                                              <div className="min-w-0 pl-1 pr-1.5">
                                                <p className="text-[9px] leading-3 font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Owner</p>
                                                <p className="truncate text-xs font-extrabold text-slate-900 dark:text-slate-50">{ownerName}</p>
                                              </div>
                                            </motion.div>
                                            {!room.isPublic && (
                                              <Badge
                                                variant="outline"
                                                className={`absolute top-2 right-2 z-40 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-md pointer-events-none border-2 ${room.visibility === 'exposed'
                                                    ? 'border-green-500 bg-green-100 text-green-800 dark:border-green-500/60 dark:bg-green-950/50 dark:text-green-300'
                                                    : 'border-blue-500 bg-blue-100 text-blue-800 dark:border-blue-500/60 dark:bg-blue-950/50 dark:text-blue-300'
                                                  }`}
                                              >
                                                {room.visibility === 'exposed' ? 'Exposed' : 'Private'}
                                              </Badge>
                                            )}
                                            {room.backgroundImage?.url && room.iconImage?.url && (
                                              <div className="absolute inset-0 bg-black/35 backdrop-brightness-75 z-2 pointer-events-none" />
                                            )}

                                            <CardHeader className="relative z-10 pb-2 pt-14 sm:pt-24">
                                              <CardTitle
                                                className={`flex items-center gap-2.5 text-xl sm:text-2xl font-bold ${room.backgroundImage?.url && room.iconImage?.url
                                                    ? 'text-slate-50'
                                                    : 'text-gray-900 dark:text-white'
                                                  }`}
                                                style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 12px rgba(0,0,0,0.65)' : 'none' }}
                                              >
                                                {/* Room Icon */}
                                                {room.iconImage ? (
                                                  <Avatar className="h-11 w-11 border-2 border-white/50 shadow-lg" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                                                    <AvatarImage src={room.iconImage.url} alt={room.name} />
                                                    <AvatarFallback>{room.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                  </Avatar>
                                                ) : (
                                                  <div className="p-2.5 rounded-xl bg-linear-to-br from-rose-500 to-pink-600 dark:from-rose-600 dark:to-pink-700 shadow-lg border border-rose-400 dark:border-rose-500" style={{ boxShadow: '0 4px 8px rgba(0,0,0,0.5)' }}>
                                                    <MessageCircle className="h-5.5 w-5.5 text-white" />
                                                  </div>
                                                )}
                                                <span
                                                  className={`flex-1 truncate transition-colors font-bold ${room.backgroundImage?.url && room.iconImage?.url
                                                      ? 'group-hover:text-white'
                                                      : 'group-hover:text-rose-600 dark:group-hover:text-rose-300'
                                                    }`}
                                                >
                                                  {room.name}
                                                </span>
                                                {room.password && (
                                                  <div className="p-1.5 rounded-lg bg-amber-500/30 backdrop-blur-sm">
                                                    <Lock className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }} />
                                                  </div>
                                                )}
                                              </CardTitle>
                                              <CardDescription
                                                className={`text-base mt-2 font-medium ${room.backgroundImage?.url && room.iconImage?.url
                                                    ? 'text-slate-100'
                                                    : 'text-gray-800 dark:text-white'
                                                  }`}
                                                style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 10px rgba(0,0,0,0.6)' : 'none' }}
                                              >
                                                {room.description}
                                              </CardDescription>
                                            </CardHeader>
                                            <CardContent className="relative z-10">
                                              <div className="space-y-3.5 text-sm sm:text-base">
                                                <div
                                                  className={`flex items-center gap-2.5 ${room.backgroundImage?.url && room.iconImage?.url
                                                      ? 'text-slate-50'
                                                      : 'text-gray-900 dark:text-white'
                                                    }`}
                                                >
                                                  <div className="p-1.5 rounded-lg bg-rose-500/30 backdrop-blur-sm">
                                                    <Users className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }} />
                                                  </div>
                                                  <span className="font-semibold" style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 8px rgba(0,0,0,0.55)' : 'none' }}>{room.participants?.length || 0} participants</span>
                                                </div>
                                                <div
                                                  className={`flex items-center gap-2.5 ${room.backgroundImage?.url && room.iconImage?.url
                                                      ? 'text-slate-50'
                                                      : 'text-gray-900 dark:text-white'
                                                    }`}
                                                >
                                                  <div className="p-1.5 rounded-lg bg-pink-500/30 backdrop-blur-sm">
                                                    <Clock className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }} />
                                                  </div>
                                                  <span className="font-semibold" style={{ textShadow: room.backgroundImage?.url && room.iconImage?.url ? '0 2px 8px rgba(0,0,0,0.55)' : 'none' }}>Created {formatDate(room.createdAt)}</span>
                                                </div>
                                              </div>

                                              {/* Action buttons */}
                                              {user && (
                                                <div className="flex gap-2 mt-5 pt-4 border-t border-gray-300 dark:border-white/30">
                                                  {(() => {
                                                    const participants = Array.isArray(room.participants) ? room.participants : [];
                                                    const isMember = room.createdBy === user.uid || participants.includes(user.uid);
                                                    const canRequestJoin = !room.isPublic && room.visibility === 'exposed' && !isMember;
                                                    const hasRequested = Array.isArray(room.joinRequests) && room.joinRequests.includes(user.uid);
                                                    const isSendingRequest = Boolean(room.id && joinRequestingRoomIds.has(room.id));

                                                    if (canRequestJoin) {
                                                      return (
                                                        <Button
                                                          size="sm"
                                                          variant="outline"
                                                          disabled={hasRequested || isSendingRequest}
                                                          className={`rounded-xl font-semibold ${room.backgroundImage?.url && room.iconImage?.url
                                                              ? 'border border-green-300/80 bg-green-500/20 text-slate-50 backdrop-blur-md hover:bg-green-500/30'
                                                              : 'border-green-400 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-500 dark:text-green-300 dark:bg-green-950/25'
                                                            }`}
                                                          onClick={(e) => handleSendJoinRequest(room, e)}
                                                        >
                                                          <Shield className="h-4 w-4 mr-1.5" />
                                                          {isSendingRequest ? 'Sending...' : hasRequested ? 'Request Sent' : 'Send Join Request'}
                                                        </Button>
                                                      );
                                                    }

                                                    return (
                                                      <Button
                                                        size="sm"
                                                        className={`rounded-xl font-semibold ${room.backgroundImage?.url && room.iconImage?.url
                                                            ? 'border border-white/60 bg-white/20 text-slate-50 backdrop-blur-md shadow-[0_0_22px_rgba(255,255,255,0.25)] hover:bg-white/30 hover:text-white hover:shadow-[0_0_30px_rgba(255,255,255,0.38)]'
                                                            : 'bg-linear-to-r from-rose-600 to-pink-600 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:from-rose-700 hover:to-pink-700 hover:shadow-[0_0_26px_rgba(244,63,94,0.65)] pulse-glow'
                                                          }`}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          router.push(`/community/room/${room.id}`);
                                                        }}
                                                      >
                                                        <MessageCircle className="h-4 w-4 mr-1.5" />
                                                        Chat Now
                                                      </Button>
                                                    );
                                                  })()}
                                                  {((room.isPublic && isAdminOrOwner) || (!room.isPublic && room.createdBy === user.uid)) &&
                                                    !((room.name || '').trim().toLowerCase() === 'general community chat' ||
                                                      (room.name || '').trim().toLowerCase() === 'general chat' ||
                                                      (room.name || '').trim().toLowerCase().startsWith('general chat') ||
                                                      (room.name || '').trim().toLowerCase().includes('general community')) && (
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-xl border-2 border-red-400 dark:border-red-400/50 bg-red-200 dark:bg-red-500/30 backdrop-blur-sm text-gray-900 dark:text-white hover:bg-red-300 dark:hover:bg-red-500/50 hover:border-red-500 dark:hover:border-red-300 transition-all font-semibold"
                                                        onClick={(e) => handleDeleteRoom(room.id!, e)}
                                                      >
                                                        <Trash2 className="h-4 w-4" />
                                                      </Button>
                                                    )}
                                                </div>
                                              )}
                                            </CardContent>
                                          </Card>
                                        );
                                      })()}
                                    </motion.div>
                                  ))}
                                </AnimatePresence>
                              </motion.div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Share Dialog */}
            <Dialog
              open={showShareDialog}
              onOpenChange={(open) => {
                setShowShareDialog(open);
                if (!open) {
                  setSocialShareMessage('');
                  setCopiedInvite(false);
                  setCopiedPassword(false);
                }
              }}
            >
              <DialogContent className="sm:max-w-137.5">
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
                        {copiedInvite ? '? Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-200 dark:border-rose-800">
                      ?? Anyone with this link can join directly without a password
                    </p>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Share via social</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => shareRoomOnSocial('facebook')}
                          disabled={!shareRoom?.inviteToken}
                          className="rounded-xl border-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-300"
                        >
                          <Facebook className="h-4 w-4 mr-1.5" />
                          Facebook
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => shareRoomOnSocial('instagram')}
                          disabled={!shareRoom?.inviteToken}
                          className="rounded-xl border-2 border-pink-200 text-pink-700 hover:bg-pink-50 dark:border-pink-500/40 dark:text-pink-300"
                        >
                          <Instagram className="h-4 w-4 mr-1.5" />
                          Instagram
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => shareRoomOnSocial('whatsapp')}
                          disabled={!shareRoom?.inviteToken}
                          className="rounded-xl border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300"
                        >
                          <MessageCircle className="h-4 w-4 mr-1.5" />
                          WhatsApp
                        </Button>
                      </div>
                      {socialShareMessage && (
                        <p className="text-xs text-gray-600 dark:text-gray-300">{socialShareMessage}</p>
                      )}
                    </div>
                  </div>

                  {/* Room Credentials */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Room Credentials
                    </Label>
                    <div className="bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl border-2 border-gray-200 dark:border-gray-700 space-y-3">
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
                      {copiedPassword ? '? Copied!' : 'Copy ID & Password'}
                    </Button>
                    <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      ?? Share these credentials for manual room access
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
 * Main Chat Page
 */
const ChatPage: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const [showResetSuccessPopup, setShowResetSuccessPopup] = useState(false);
  const [offers, setOffers] = useState<LiveOffer[]>([]);
  const showOfferSpotlight = useMemo(() => {
    if (authLoading) return false;
    const subscriptionInfo = getSubscriptionInfo(userProfile);
    return !hasPaidAccess(subscriptionInfo);
  }, [authLoading, userProfile]);

  useEffect(() => {
    let cancelled = false;

    const loadOffers = async () => {
      try {
        const response = await fetch('/api/offers?limit=20');
        if (!response.ok) {
          throw new Error('Failed to fetch offers');
        }
        const payload = await response.json();
        if (cancelled) return;

        const offerRows = (Array.isArray(payload?.data) ? payload.data : []) as LiveOffer[];
        const rows = offerRows
          .filter((offer: LiveOffer) => offer.isActive)
          .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
        setOffers(rows);
      } catch {
        if (!cancelled) setOffers([]);
      }
    };

    void loadOffers();

    return () => {
      cancelled = true;
    };
  }, []);

  // Show one-time password reset success popup if redirected from reset flow
  useEffect(() => {
    try {
      const flag = localStorage.getItem('abjee:passwordResetSuccess');
      if (flag) {
        localStorage.removeItem('abjee:passwordResetSuccess');
        setShowResetSuccessPopup(true);
        window.setTimeout(() => setShowResetSuccessPopup(false), 3500);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  return (
    <div className="min-h-screen pt-16 md:pt-20 bg-linear-to-br from-rose-50 via-pink-50 to-red-50 dark:from-gray-900 dark:via-rose-900/20 dark:to-pink-900/20">
      <Header />
      {showResetSuccessPopup && (
        <div className="fixed left-1/2 top-24 z-50 w-[min(92%,420px)] -translate-x-1/2 rounded-lg bg-emerald-600/95 text-white p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="font-semibold">Password updated</div>
              <div className="text-sm opacity-90">Your password was updated — you're signed in now.</div>
            </div>
            <div className="shrink-0">
              <Button onClick={() => setShowResetSuccessPopup(false)} variant="ghost" className="text-white">Close</Button>
            </div>
          </div>
        </div>
      )}
      {showOfferSpotlight && (
        <OfferSpotlightPopup
          offers={offers}
          contextLabel="Community Offers"
        />
      )}
      <ChatRoomsList />
      <Footer4Col />
    </div>
  );
};

export default ChatPage;
