"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  X,
  Trash2,
  PauseCircle,
  PlayCircle,
  MapPin,
  Image as ImageIcon,
  Star,
  ChevronLeft,
  ChevronRight,
  Compass,
  MessageCircle,
  Facebook,
  Instagram,
  Play,
  Maximize2,
  Minimize2,
  FileText,
  Share2,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import type { TouristPlace } from "@/components/ui/tourist-places";
import { publicAsset } from "@/lib/publicAsset";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeRichTextHtmlForDisplay } from "@/lib/richTextDisplay";
import { buildAbjeeShareText } from "@/lib/socialShare";
import { createImagePreview, revokeImagePreview, uploadImageToR2 } from "@/lib/r2Upload";
import { placesAPI } from "@/lib/api";
import { buildGoogleMapsEmbedUrl } from "@/components/ui/google-map-display";
import { compressImageFile, compressVideoFile } from "@/lib/r2FileUpload";
import { useAuth } from "@/contexts/AuthContext";
import { getSubscriptionInfo, hasPaidAccess } from "@/lib/subscriptionPolicy";

const STATIC_VIDEO_V1 = publicAsset("/v1.mp4");
const MAX_PHOTOS_PER_REVIEW = 2;
const MAX_VIDEOS_PER_REVIEW = 1;
const MAX_VIDEO_SIZE_MB = 5;

const SEARCH_PAGE_SIZE = 12;
const SEARCH_API_PATH = "/api/places";

type ReviewMediaFile = {
  file: File;
  preview: string;
};

type PlaceReview = {
  id: string;
  text: string;
  author: string;
  userId: string;
  rating: number;
  createdAt: unknown;
  media: Array<{
    url: string;
    publicId: string;
    type: "image" | "video";
    caption?: string;
    thumbnail?: string;
  }>;
};

type SearchResponse = {
  results?: TouristPlace[];
  rows?: TouristPlace[];
  lastDoc?: string | null;
  hasMore?: boolean;
  searchTerm?: string;
  cacheStatus?: 'hit' | 'miss';
  reset?: boolean;
  pagination?: {
    page?: number;
    hasNext?: boolean;
    total?: number;
  };
};

const normalizeSearchInput = (value: string) => value.replace(/\+/g, " ").replace(/\s+/g, " ").trim();

async function uploadVideoToR2(file: File): Promise<{ url: string; key: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", "tourist-places/reviews/videos");

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(error.error ?? "Video upload failed");
  }

  const data = await response.json() as { url: string; key: string };
  return { url: data.url, key: data.key };
}

const PlaceCard: React.FC<{
  place: TouristPlace;
  idx: number;
  onSelect: () => void;
  disableVideoAutoplay?: boolean;
}> = memo(({ place, idx, onSelect, disableVideoAutoplay = false }) => {
  const videos = place.media?.filter((item) => item.type === "video") ?? [];
  const images = place.media?.filter((item) => item.type === "image") ?? [];
  const hasVideo = videos.length > 0;

  const [imgIdx, setImgIdx] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const dragRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const safeDescriptionHtml = place.description ? sanitizeRichTextHtmlForDisplay(place.description) : "";

  useEffect(() => {
    if (!isInteracting || hasVideo || images.length <= 1) return;
    const timer = window.setInterval(() => {
      setImgIdx((current) => (current + 1) % images.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [hasVideo, images.length, isInteracting]);

  const sharePlace = (platform: "facebook" | "instagram" | "whatsapp", event: React.MouseEvent) => {
    event.stopPropagation();

    const shareUrl = new URL(window.location.href);
    shareUrl.pathname = "/tourplaces";
    shareUrl.searchParams.set("place", place.name);
    const url = shareUrl.toString();

    const shortLocation = place.area || place.state || place.country;
    const shareText = buildAbjeeShareText({
      title: place.name,
      location: shortLocation,
      url,
    });

    if (platform === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareText)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    if (platform === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
      return;
    }

    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    void navigator.clipboard.writeText(shareText)
      .then(() => setShareMessage("Copied for Instagram"))
      .catch(() => setShareMessage("Copy failed for Instagram"));
    window.setTimeout(() => setShareMessage(""), 1000);
  };

  const toggleVideo = (event: React.MouseEvent) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setIsPaused(false);
    } else {
      video.pause();
      setIsPaused(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.04 * idx, type: "spring", stiffness: 260, damping: 24 }}
      whileHover={{ y: -8, scale: 1.02 }}
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocus={() => setIsInteracting(true)}
      onBlur={() => setIsInteracting(false)}
      className="group relative w-full max-w-[20rem] cursor-pointer overflow-hidden rounded-[1.65rem] border border-white/10 bg-[#2e3138]/90 text-left shadow-[0_14px_36px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_22px_48px_rgba(0,0,0,0.38)]"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open details for ${place.name}`}
        className="absolute inset-0 z-10 rounded-[1.65rem] focus:outline-none"
      >
        <span className="sr-only">Open {place.name}</span>
      </button>

      <div className="relative h-[13.4rem] overflow-hidden">
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              src={videos[0].url}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              autoPlay={!disableVideoAutoplay}
              muted
              loop
              playsInline
              controls={!disableVideoAutoplay}
              preload="metadata"
              onPlay={() => setIsPaused(false)}
              onPause={() => setIsPaused(true)}
            />
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              animate={isPaused ? { scale: 1 } : { scale: [1, 1.08, 1] }}
              transition={isPaused ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              onClick={toggleVideo}
              className="absolute bottom-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_8px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm"
            >
              {isPaused ? <Play className="h-3.5 w-3.5 ml-0.5" /> : <PauseCircle className="h-4 w-4" />}
            </motion.button>
          </>
        ) : (images.length > 0 || place.coverImage) ? (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={images.length > 0 ? `${imgIdx}-${images[imgIdx].url}` : `cover-${place.coverImage}`}
                src={images.length > 0 ? images[imgIdx].url : place.coverImage}
                alt={(images.length > 0 ? images[imgIdx].caption : place.name) ?? place.name}
                className="absolute inset-0 h-full w-full select-none object-cover"
                initial={{ opacity: 0, x: 55 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -55 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                drag={images.length > 1 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (images.length > 1) {
                    if (info.offset.x < -40) setImgIdx((current) => (current + 1) % images.length);
                    else if (info.offset.x > 40) setImgIdx((current) => (current - 1 + images.length) % images.length);
                  }
                  if (Math.abs(info.offset.x) > 10) {
                    dragRef.current = true;
                    window.setTimeout(() => {
                      dragRef.current = false;
                    }, 80);
                  }
                }}
                onClick={(event) => {
                  if (dragRef.current) event.stopPropagation();
                }}
                onError={() => setImageFailed(true)}
                draggable={false}
              />
            </AnimatePresence>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImgIdx((current) => (current - 1 + images.length) % images.length);
                  }}
                  className="absolute left-1.5 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/75"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setImgIdx((current) => (current + 1) % images.length);
                  }}
                  className="absolute right-1.5 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/75"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </>
        ) : imageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-rose-600 to-pink-700">
            <Compass className="h-14 w-14 text-white/40" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-rose-600 to-pink-700">
            <Compass className="h-14 w-14 text-white/40" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-[#ff1662] px-2.5 py-1 text-[10px] font-bold text-white shadow-lg shadow-black/20">
            {place.category}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => sharePlace("facebook", event)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-black/60"
            >
              <Facebook className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => sharePlace("instagram", event)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-black/60"
            >
              <Instagram className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => sharePlace("whatsapp", event)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/10 backdrop-blur-sm hover:bg-black/60"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
          {shareMessage && <span className="rounded-md bg-black/70 px-2 py-1 text-[10px] text-white/90">{shareMessage}</span>}
        </div>

        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur-sm">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/70"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative border-t border-black/5 bg-white px-4 py-4 backdrop-blur-[22px] dark:border-white/10 dark:bg-white/10">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/80 via-white/60 to-white/90 dark:from-white/10 dark:via-white/6 dark:to-black/10" />
        <div className="relative">
          <h3 className="mb-2 text-[1.02rem] font-extrabold leading-tight text-gray-900 line-clamp-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.25)] dark:text-[#ffd7df] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">{place.name}</h3>
          <div className="mb-2 flex items-center gap-1 text-[12px] text-gray-600 dark:text-white/68">
            <MapPin className="h-3 w-3 shrink-0 text-[#ff5d8f]" />
            <span className="line-clamp-1">{[place.area, place.state, place.country].filter(Boolean).join(", ")}</span>
          </div>
          <div className="min-h-[3.45rem]">
            {place.description ? (
              <div
                className="text-[12px] leading-relaxed text-gray-600 line-clamp-3 dark:text-white/68 [&_div]:inline [&_p]:inline [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_h1]:mb-2 [&_h1]:text-[1.05rem] [&_h1]:font-extrabold [&_h2]:mb-2 [&_h2]:text-[0.98rem] [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:text-[0.94rem] [&_h3]:font-bold [&_h4]:mb-1.5 [&_h4]:text-[0.9rem] [&_h4]:font-semibold [&_h5]:mb-1 [&_h5]:text-[0.86rem] [&_h5]:font-semibold [&_h6]:mb-1 [&_h6]:text-[0.82rem] [&_h6]:font-semibold"
                dangerouslySetInnerHTML={{ __html: safeDescriptionHtml }}
              />
            ) : (
              <p className="invisible text-[12px] leading-relaxed line-clamp-3">No description</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/50">
            <ImageIcon className="h-3.5 w-3.5" />
            <span>{place.media?.length || 0}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.place.id === nextProps.place.id &&
    prevProps.disableVideoAutoplay === nextProps.disableVideoAutoplay
  );
});

PlaceCard.displayName = "PlaceCard";

const TourPlaces: React.FC = () => {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const isMobile = useIsMobile();
  const handledPlaceParamRef = useRef<string | null>(null);
  const lastSearchTermRef = useRef<string>("");
  const searchRequestIdRef = useRef(0);
  const clientSearchCacheRef = useRef(new Map<string, SearchResponse>());
  const inFlightSearchRef = useRef(new Map<string, Promise<SearchResponse>>());
  const prefetchQueueRef = useRef<Map<string, SearchResponse>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const seeMoreRef = useRef<HTMLButtonElement | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);
  const [searchResults, setSearchResults] = useState<TouristPlace[]>([]);
  const [searchPage, setSearchPage] = useState<number>(1);
  const [searchHasMore, setSearchHasMore] = useState(false);


  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [actualSearchQuery, setActualSearchQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<TouristPlace | null>(null);
  const [isWindowExpanded, setIsWindowExpanded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [placeReviews, setPlaceReviews] = useState<Record<string, PlaceReview[]>>({});
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewMediaFiles, setReviewMediaFiles] = useState<ReviewMediaFile[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewUploadError, setReviewUploadError] = useState("");
  const [reviewRewardMessage, setReviewRewardMessage] = useState("");
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const reviewMediaInputRef = useRef<HTMLInputElement | null>(null);



  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };

    const updateMode = () => {
      const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
      const slowNetwork = nav.connection?.effectiveType?.includes("2g") || nav.connection?.effectiveType === "3g";
      setMobilePerformanceMode(mediaQuery.matches || lowMemory || Boolean(slowNetwork));
    };

    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawPlace = params.get("place") || params.get("search");
    if (!rawPlace) return;

    const normalized = normalizeSearchInput(rawPlace);
    setSearchInput(normalized);
    
    // Trigger the search immediately if search term is valid
    if (normalized.length >= 3) {
      setActualSearchQuery(normalized);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchResults.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const rawPlace = params.get("place");
    if (!rawPlace) {
      handledPlaceParamRef.current = null;
      return;
    }

    const decodedPlace = rawPlace.replace(/\+/g, " ").trim();
    const normalizedQuery = decodedPlace.toLowerCase().replace(/\s+/g, " ");
    if (!normalizedQuery) return;
    if (handledPlaceParamRef.current === normalizedQuery) return;

    const match = searchResults.find((place: TouristPlace) =>
      place.name
        ?.toLowerCase()
        .replace(/\s+/g, " ")
        .trim() === normalizedQuery,
    );

    if (!match) return;

    handledPlaceParamRef.current = normalizedQuery;
    setSelectedPlace(match);
    setSearchInput((prev) => prev || match.name);
  }, [searchResults]);

  const resetSearchState = useCallback(() => {
    setSearchResults([]);
    setSearchPage(1);
    setSearchHasMore(false);
    setSearchLoading(false);
    setSearchError("");
    setActiveSearchTerm("");
    lastSearchTermRef.current = "";
  }, []);

  const buildClientCacheKey = useCallback((query: string, page: number) => {
    return `search:${query.toLowerCase()}:p:${page}`;
  }, []);

  const requestSearchPage = useCallback(async (query: string, page: number, options?: { signal?: AbortSignal }): Promise<SearchResponse> => {
    const cacheKey = buildClientCacheKey(query, page);
    const cached = clientSearchCacheRef.current.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cacheStatus: "hit",
      };
    }

    const existingRequest = inFlightSearchRef.current.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }

    const requestUrl = new URL(SEARCH_API_PATH, window.location.origin);
    requestUrl.searchParams.set("search", query);
    requestUrl.searchParams.set("limit", String(SEARCH_PAGE_SIZE));
    requestUrl.searchParams.set("page", String(page));

    const request = fetch(requestUrl.toString(), {
      method: "GET",
      signal: options?.signal,
    }).then(async (response) => {
      const payload = (await response.json().catch(() => null)) as { success?: boolean; data?: SearchResponse; message?: string; reset?: boolean } | null;
      if (!response.ok || !payload?.success || !payload.data) {
        const error = new Error(payload?.message || `Search failed with status ${response.status}`) as Error & { reset?: boolean };
        if (payload?.reset) {
          error.reset = true;
        }
        throw error;
      }

      const normalizedResults = Array.isArray(payload.data.results)
        ? payload.data.results
        : Array.isArray(payload.data.rows)
          ? payload.data.rows
          : [];
      const normalizedPayload: SearchResponse = {
        ...payload.data,
        results: normalizedResults,
        hasMore: payload.data.hasMore ?? payload.data.pagination?.hasNext ?? false,
      };

      clientSearchCacheRef.current.set(cacheKey, normalizedPayload);
      return normalizedPayload;
    }).finally(() => {
      inFlightSearchRef.current.delete(cacheKey);
    });

    inFlightSearchRef.current.set(cacheKey, request);
    return request;
  }, [buildClientCacheKey]);



  const triggerPrefetch = useCallback((term: string, page: number) => {
    const nextKey = `${term}:p${page}`;
    if (prefetchQueueRef.current.has(nextKey)) return;

    console.info("[Client/Places] Triggering prefetch for bottom-of-page", { nextKey });
    requestSearchPage(term, page).then((nextPayload) => {
      prefetchQueueRef.current.set(nextKey, nextPayload);
    }).catch(() => null);
  }, [requestSearchPage]);

  // Observer for prefetch
  useEffect(() => {
    if (!searchHasMore || !activeSearchTerm) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        triggerPrefetch(activeSearchTerm, searchPage + 1);
      }
    }, { rootMargin: '400px' }); // Trigger when 400px from button

    if (seeMoreRef.current) {
      observer.observe(seeMoreRef.current);
    }

    return () => observer.disconnect();
  }, [searchHasMore, searchPage, activeSearchTerm, triggerPrefetch]);

  const fetchSearchResults = useCallback(async (term: string, options?: { append?: boolean; lastDoc?: string | null }) => {
    const normalizedTerm = normalizeSearchInput(term);
    if (normalizedTerm.length < 3) {
      resetSearchState();
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    const append = options?.append ?? false;
    const page = append ? (searchPage + 1) : 1;

    if (!append) {
      setSearchLoading(true);
      setSearchResults([]);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearchError("");
    } else {
      setSearchLoading(true);
      setSearchError("");
    }

    try {
      // Check prefetch cache first
      const cacheKey = `${normalizedTerm}:p${page}`;
      const prefetched = prefetchQueueRef.current.get(cacheKey);

      let payload: SearchResponse;
      if (prefetched) {
        console.info("[Client/Places] Using prefetched result", { cacheKey });
        payload = prefetched;
        prefetchQueueRef.current.delete(cacheKey);
      } else {
        // Handle request abortion
        if (!append) {
          abortControllerRef.current?.abort();
          abortControllerRef.current = new AbortController();
        }
        payload = await requestSearchPage(normalizedTerm, page, { signal: abortControllerRef.current?.signal });
      }

      const nextResults = Array.isArray(payload.results) ? payload.results : [];

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setActiveSearchTerm(normalizedTerm);
      setSearchPage(page);
      setSearchHasMore(Boolean(payload.hasMore ?? false));
      setSearchResults((prev) => {
        const existingIds = new Set(append ? prev.map((p) => p.id) : []);
        const filteredNext = nextResults.filter((p) => p.id && !existingIds.has(p.id));
        
        // Final sanity check for duplicates within filteredNext itself
        const finalResults = [];
        const seenIds = new Set(existingIds);
        for (const p of filteredNext) {
          if (p.id && !seenIds.has(p.id)) {
            finalResults.push(p);
            seenIds.add(p.id);
          }
        }

        return append ? [...prev, ...finalResults] : finalResults;
      });
      setSearchError("");
      lastSearchTermRef.current = normalizedTerm;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "Failed to search tourist places.";
      if ((error as { reset?: boolean }).reset) {
        resetSearchState();
        setSearchError(message);
        return;
      }
      setSearchError(message);
      if (!append) {
        setSearchResults([]);
        setSearchPage(1);
        setSearchHasMore(false);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearchLoading(false);
      }
    }
  }, [requestSearchPage, resetSearchState]);

  const loadPlaceReviews = useCallback(async (placeId: string, options?: { refresh?: boolean }) => {
    const response = await placesAPI.getReviews(placeId, options);
    const payload = response.data?.data ?? response.data ?? {};
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    const reviews = rows.map((reviewDoc: unknown) => {
      const raw = (reviewDoc && typeof reviewDoc === "object") ? reviewDoc as Record<string, unknown> : {};
      const data = raw as {
        id?: unknown;
        text?: unknown;
        author?: unknown;
        userId?: unknown;
        rating?: unknown;
        createdAt?: unknown;
        media?: unknown;
      };

      const media = Array.isArray(data.media)
        ? data.media
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const mediaItem = item as {
              url?: unknown;
              publicId?: unknown;
              type?: unknown;
              caption?: unknown;
              thumbnail?: unknown;
            };

            if (typeof mediaItem.url !== "string" || typeof mediaItem.publicId !== "string") return null;
            const mediaType = mediaItem.type === "video" ? "video" : "image";

            const result: PlaceReview["media"][number] = {
              url: mediaItem.url,
              publicId: mediaItem.publicId,
              type: mediaType,
            };
            if (typeof mediaItem.caption === "string") result.caption = mediaItem.caption;
            if (typeof mediaItem.thumbnail === "string") result.thumbnail = mediaItem.thumbnail;
            return result;
          })
          .filter((item): item is PlaceReview["media"][number] => item !== null)
        : [];

      const rating = Number(data.rating);

      return {
        id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
        text: typeof data.text === "string" ? data.text : "",
        author: typeof data.author === "string" ? data.author : "Traveller",
        userId: typeof data.userId === "string" ? data.userId : "anonymous",
        rating: Number.isFinite(rating) ? Math.max(1, Math.min(5, rating)) : 5,
        createdAt: data.createdAt,
        media,
      } satisfies PlaceReview;
    });

    setPlaceReviews((current) => ({ ...current, [placeId]: reviews }));
  }, []);

  const handleSearchTrigger = useCallback((term: string) => {
    const normalized = normalizeSearchInput(term);
    if (normalized.length < 3) return;
    setActualSearchQuery(normalized);
  }, []);

  useEffect(() => {
    if (!actualSearchQuery) {
      if (searchInput.trim() === "" && activeSearchTerm.trim() === "") {
        return;
      }
      resetSearchState();
      return;
    }

    if (actualSearchQuery !== lastSearchTermRef.current) {
      setSearchResults([]);
      setSearchPage(1);
      setSearchHasMore(false);
      setSearchError("");
    }

    void fetchSearchResults(actualSearchQuery, { append: false });
  }, [fetchSearchResults, resetSearchState, actualSearchQuery]);

  const searchQuery = normalizeSearchInput(searchInput);
  const showSuggestions = searchResults.length === 0 && (!actualSearchQuery || searchQuery !== actualSearchQuery);
  const suggestionPlaces = ["Tirupati", "Manali", "Goa", "Kerala", "Shimla", "Ladakh"];

  const selectedPlaceImages = useMemo(() => selectedPlace?.media?.filter((item) => item.type === "image") ?? [], [selectedPlace?.media]);
  const selectedPlaceVideos = useMemo(() => selectedPlace?.media?.filter((item) => item.type === "video") ?? [], [selectedPlace?.media]);
  const selectedPlaceMapPreviewUrl = useMemo(
    () => buildGoogleMapsEmbedUrl({
      destination: selectedPlace?.name,
      googleMapsUrl: selectedPlace?.googleMapsUrl,
      zoom: 13,
    }),
    [selectedPlace?.googleMapsUrl, selectedPlace?.name],
  );
  const selectedPlaceReviewList = useMemo(
    () => (selectedPlace?.id ? (placeReviews[selectedPlace.id] ?? []) : []),
    [placeReviews, selectedPlace?.id],
  );
  const selectedPlaceAverageRating = useMemo(() => {
    if (selectedPlaceReviewList.length === 0) return 0;
    return selectedPlaceReviewList.reduce((sum, review) => sum + review.rating, 0) / selectedPlaceReviewList.length;
  }, [selectedPlaceReviewList]);

  const closeSelectedPlace = () => {
    setSelectedPlace(null);
    setIsWindowExpanded(false);
    setReviewRating(0);
    setReviewText("");
    setReviewMediaFiles((current) => {
      current.forEach((item) => revokeImagePreview(item.preview));
      return [];
    });
    setReviewUploadError("");
    setReviewRewardMessage("");
  };

  const handlePlaceShare = async (type: "whatsapp" | "facebook" | "copy") => {
    if (!selectedPlace) return;

    const shareUrl = new URL(window.location.href);
    shareUrl.pathname = "/tourplaces";
    shareUrl.searchParams.set("place", selectedPlace.name);
    const url = shareUrl.toString();

    const shortLocation = selectedPlace.area || selectedPlace.state || selectedPlace.country;
    const message = buildAbjeeShareText({
      title: selectedPlace.name,
      location: shortLocation,
      url,
    });

    if (type === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      return;
    }

    if (type === "facebook") {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      return;
    }

    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1200);
  };

    const handleReviewMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? []);
    if (pickedFiles.length === 0) return;

    const validFiles = pickedFiles.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (validFiles.length === 0) {
      setReviewUploadError("Select image or video files for your review.");
      event.target.value = "";
      return;
    }

    // Separate photos and videos
    const photos = validFiles.filter((file) => file.type.startsWith("image/"));
    const videos = validFiles.filter((file) => file.type.startsWith("video/"));

    // Check subscription status for videos
    const subscriptionInfo = getSubscriptionInfo(userProfile);
    const isPaidUser = hasPaidAccess(subscriptionInfo);

    let errorMessage = "";

    // Validate photo limit (max 2 for all users)
    if (photos.length > MAX_PHOTOS_PER_REVIEW) {
      errorMessage = `Maximum ${MAX_PHOTOS_PER_REVIEW} photos allowed per review.`;
      event.target.value = "";
      setReviewUploadError(errorMessage);
      return;
    }

    // Validate videos
    if (videos.length > 0) {
      if (!isPaidUser) {
        errorMessage = "Videos are only available for premium members. Please upgrade your subscription.";
        event.target.value = "";
        setReviewUploadError(errorMessage);
        return;
      }

      if (videos.length > MAX_VIDEOS_PER_REVIEW) {
        errorMessage = `Maximum ${MAX_VIDEOS_PER_REVIEW} video allowed per review.`;
        event.target.value = "";
        setReviewUploadError(errorMessage);
        return;
      }

      // Validate video size (max 5 MB)
      const videoSizeInMB = videos[0].size / (1024 * 1024);
      if (videoSizeInMB > MAX_VIDEO_SIZE_MB) {
        errorMessage = `Video size must be less than ${MAX_VIDEO_SIZE_MB}MB. Your file is ${videoSizeInMB.toFixed(2)}MB.`;
        event.target.value = "";
        setReviewUploadError(errorMessage);
        return;
      }
    }

    setReviewMediaFiles((current) => {
      current.forEach((item) => revokeImagePreview(item.preview));
      return validFiles.map((file) => ({ file, preview: createImagePreview(file) }));
    });
    setReviewUploadError(validFiles.length < pickedFiles.length ? "Some unsupported files were skipped." : "");

    event.target.value = "";
  };

  const submitPlaceReview = async () => {
    const hasContent = reviewText.trim().length > 0 || reviewMediaFiles.length > 0 || reviewRating > 0;
    if (!selectedPlace?.id || !hasContent) return;

    setReviewSubmitting(true);
    setReviewUploadError("");

    try {
      const reviewTextValue = reviewText.trim();
      const reviewMedia = [] as Array<{
        url: string;
        publicId: string;
        type: "image" | "video";
        caption?: string;
      }>;

      for (const { file } of reviewMediaFiles) {
        const isVideo = file.type.startsWith("video/");
        const preparedFile = isVideo
          ? await compressVideoFile(file, {
            maxSizeBytes: 5 * 1024 * 1024,
            maxWidth: 1280,
            maxHeight: 720,
            frameRate: 24,
            minVideoBitsPerSecond: 450_000,
            maxVideoBitsPerSecond: 1_600_000,
            audioBitsPerSecond: 96_000,
          })
          : await compressImageFile(file, {
            maxSizeBytes: 1024 * 1024,
            maxDimension: 1600,
          });

        let url = "";
        let publicId = "";

        if (isVideo) {
          const uploaded = await uploadVideoToR2(preparedFile);
          url = uploaded.url;
          publicId = uploaded.key;
        } else {
          const uploaded = await uploadImageToR2(preparedFile, { folder: "tourist-places/reviews/images" });
          url = uploaded.url;
          publicId = uploaded.publicId;
        }

        const mediaItem: PlaceReview["media"][number] = {
          url,
          publicId,
          type: isVideo ? "video" : "image",
          ...(reviewTextValue ? { caption: reviewTextValue } : {})
        };

        reviewMedia.push(mediaItem);
      }

      const response = await placesAPI.createReview({
        placeId: selectedPlace.id,
        text: reviewTextValue,
        rating: reviewRating > 0 ? reviewRating : 5,
        media: reviewMedia,
      });
      const payload = response.data?.data ?? response.data ?? {};
      const earnedPoints = Number(payload?.ABJee?.totalPoints || 0);
      if (earnedPoints > 0) {
        setReviewRewardMessage(`You earned ${earnedPoints} Rb point${earnedPoints === 1 ? "" : "s"} for this review.`);
      }

      await loadPlaceReviews(selectedPlace.id, { refresh: true });

      setReviewText("");
      setReviewRating(0);
      reviewMediaFiles.forEach((item) => revokeImagePreview(item.preview));
      setReviewMediaFiles([]);
      if (reviewMediaInputRef.current) reviewMediaInputRef.current.value = "";
    } catch (error) {
      setReviewUploadError(error instanceof Error ? error.message : "Failed to post review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (!selectedPlace?.id) {
      setPlaceReviews({});
      return;
    }

    void loadPlaceReviews(selectedPlace.id);
  }, [loadPlaceReviews, selectedPlace?.id]);

  useEffect(() => {
    setReviewRating(0);
    setReviewText("");
    setReviewUploadError("");
    setReviewRewardMessage("");
    reviewMediaFiles.forEach((item) => revokeImagePreview(item.preview));
    setReviewMediaFiles([]);
    if (reviewMediaInputRef.current) reviewMediaInputRef.current.value = "";
  }, [selectedPlace?.id]);

  const deletePlaceReview = useCallback(async (reviewId: string) => {
    if (!selectedPlace?.id || !user?.uid || deletingReviewId) return;

    const target = selectedPlaceReviewList.find((review) => review.id === reviewId);
    if (!target || target.userId !== user.uid) return;

    setDeletingReviewId(reviewId);
    setReviewUploadError("");
    try {
      await placesAPI.deleteReview(selectedPlace.id, reviewId);
      setReviewRewardMessage("");
      await loadPlaceReviews(selectedPlace.id, { refresh: true });
    } catch (error) {
      setReviewUploadError(error instanceof Error ? error.message : "Failed to delete review.");
    } finally {
      setDeletingReviewId(null);
    }
  }, [deletingReviewId, loadPlaceReviews, selectedPlace?.id, selectedPlaceReviewList, user?.uid]);

  const handleSeeMore = useCallback(() => {
    if (!activeSearchTerm || !searchHasMore || searchLoading) return;
    void fetchSearchResults(activeSearchTerm, { append: true });
  }, [activeSearchTerm, fetchSearchResults, searchHasMore, searchLoading]);

  const placeCards = useMemo(
    () =>
      searchResults
        .filter((place) => {
          if (!place.id || place.id === "undefined") {
            console.error("[TourPlaces] Skipping place with missing/invalid ID:", place);
            return false;
          }
          return true;
        })
        .map((place, index) => (
          <PlaceCard
            key={place.id || `place-${index}`}
            place={place}
            idx={index}
            onSelect={() => setSelectedPlace(place)}
            disableVideoAutoplay={mobilePerformanceMode || isMobile}
          />
        )),
    [isMobile, mobilePerformanceMode, searchResults],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className="relative min-h-screen overflow-x-hidden bg-black/80"
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        {hasHydrated && (
          <video
            autoPlay={isVideoPlaying && !mobilePerformanceMode}
            loop
            muted
            playsInline
            preload={mobilePerformanceMode ? "none" : "metadata"}
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={STATIC_VIDEO_V1} type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-linear-to-b from-black/60 via-black/20 to-black/70" />
        <div className="absolute inset-0 bg-linear-to-r from-black/30 via-transparent to-black/30" />
      </div>

      <div className="relative z-10 mx-auto min-h-screen max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto flex min-h-screen w-full items-start justify-center"
        >
          <div className="flex w-full flex-col gap-8 overflow-x-hidden px-2 sm:px-4">
            <div className="sticky top-4 z-20 mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by place, area, state, or country"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchTrigger(searchInput);
                    }
                  }}
                  className="w-full rounded-full bg-white/95 py-3.5 pl-12 pr-28 text-sm text-gray-900 shadow-2xl shadow-black/40 backdrop-blur-xl placeholder:text-gray-400 focus:outline-none sm:py-4 sm:pl-14 sm:pr-32 sm:text-base"
                />
                <button
                  type="button"
                  onClick={() => handleSearchTrigger(searchInput)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-rose-600 sm:px-6 sm:py-2.5 sm:text-sm"
                >
                  Search
                </button>
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setActualSearchQuery("");
                      setSelectedPlace(null);
                    }}
                    className="absolute right-24 top-1/2 -translate-y-1/2 rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-rose-100 hover:text-rose-500 sm:right-28"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsVideoPlaying((prev) => !prev)}
                className="shrink-0 rounded-full border border-white/20 bg-white/15 p-2.5 shadow-lg backdrop-blur-md hover:bg-white/25 sm:p-3"
              >
                {isVideoPlaying ? <PauseCircle className="h-6 w-6 text-white sm:h-7 sm:w-7" /> : <PlayCircle className="h-6 w-6 text-white sm:h-7 sm:w-7" />}
              </button>

              <button
                type="button"
                onClick={() => router.push("/community")}
                className="shrink-0 rounded-full border border-white/20 bg-white/15 p-2.5 shadow-lg backdrop-blur-md hover:bg-red-500/40 sm:p-3"
              >
                <X className="h-6 w-6 text-white sm:h-7 sm:w-7" />
              </button>
            </div>

            {showSuggestions ? (
              <section className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center px-4 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 shadow-2xl shadow-black/30 ring-1 ring-white/15 backdrop-blur-md">
                  <Search className="h-10 w-10 text-white/90" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                  Where do you want to go?
                </h1>
                <p className="mt-2 max-w-xl text-sm text-white/70 sm:text-base">
                  Search by place, area, state, or country
                </p>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {suggestionPlaces.map((placeName) => (
                    <button
                      key={placeName}
                      type="button"
                      onClick={() => {
                        setSearchInput(placeName);
                        handleSearchTrigger(placeName);
                        closeSelectedPlace();
                      }}
                      className="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-white/18"
                    >
                      {placeName}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <>
                <div className="text-center">
                  <div className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md">
                    <span className="inline-flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-rose-400" />
                      {searchResults.length} loaded results for “{searchQuery}”
                    </span>

                  </div>
                </div>
                {searchError && (
                  <div className="mx-auto w-full max-w-2xl rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-100 backdrop-blur-md">
                    {searchError}
                  </div>
                )}

                {searchLoading && searchResults.length === 0 ? (
                  <div className="mx-auto flex min-h-72 w-full max-w-2xl items-center justify-center rounded-3xl border border-white/10 bg-black/20 px-4 py-10 text-center text-white/70 backdrop-blur-md">
                    Searching tourist places...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="mx-auto flex min-h-72 w-full max-w-2xl flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/20 px-4 py-10 text-center text-white/70 backdrop-blur-md">
                    <Search className="mb-4 h-10 w-10 text-white/50" />
                    <p className="text-lg font-semibold text-white">No places found</p>
                    <p className="mt-2 text-sm text-white/60">Try a different place, area, state, or country.</p>
                  </div>
                ) : (
                  <motion.div className="w-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {placeCards}
                    </div>
                  </motion.div>
                )}

                {searchHasMore && searchResults.length > 0 && (
                  <div className="flex justify-center pb-6 pt-2">
                    <button
                      ref={seeMoreRef}
                      type="button"
                      onClick={handleSeeMore}
                      disabled={searchLoading}
                      className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {searchLoading ? 'Loading...' : 'See More'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedPlace && (
          <motion.div
            data-lenis-prevent
            className="fixed inset-0 z-60 overflow-y-auto overscroll-contain touch-pan-y bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSelectedPlace}
          >
            <div className="min-h-screen py-0 flex items-start justify-center px-4 sm:px-6">
              <motion.div
                layout
                className={`relative w-full mx-auto min-h-screen overflow-hidden shadow-2xl transition-[max-width,margin,border-radius] duration-500 ease-out ${isWindowExpanded ? "max-w-[98vw] md:my-2 md:rounded-2xl" : "max-w-4xl md:my-8 md:rounded-3xl"}`}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ layout: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="relative h-72 md:h-96 overflow-hidden">
                  {selectedPlaceVideos[0] ? (
                    <video
                      src={selectedPlaceVideos[0].url}
                      className="absolute inset-0 h-full w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : selectedPlaceImages[0] ? (
                    <img src={selectedPlaceImages[0].url} alt={selectedPlace.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : selectedPlace.coverImage ? (
                    <img src={selectedPlace.coverImage} alt={selectedPlace.name} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-rose-600 to-pink-700">
                      <Compass className="h-16 w-16 text-white/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

                  <button
                    type="button"
                    onClick={closeSelectedPlace}
                    className="absolute top-4 left-4 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsWindowExpanded((prev) => !prev)}
                    title={isWindowExpanded ? "Restore card width" : "Expand to window width"}
                    className="absolute top-4 right-4 hidden rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/60 md:inline-flex"
                  >
                    {isWindowExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>

                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    <div className="mb-2 flex items-center gap-2 text-rose-300">
                      <MapPin className="h-4 w-4" />
                      <span>{[selectedPlace.area, selectedPlace.state, selectedPlace.country].filter(Boolean).join(", ")}</span>
                    </div>
                    <h1 className="text-3xl font-black text-white drop-shadow-2xl md:text-5xl">{selectedPlace.name}</h1>
                    <div className="mt-2 text-sm text-gray-300 flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white">{selectedPlace.category}</span>
                      {selectedPlace.googleMapsUrl && <span className="hidden sm:inline">Open the place details below</span>}
                    </div>
                  </div>
                </div>

                <div className="bg-background p-5 md:p-8">
                  <div className="space-y-6">
                    <section className="rounded-2xl border border-rose-100 bg-linear-to-br from-amber-50 via-white to-rose-50 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-base font-bold text-gray-800">
                          <span className="rounded-lg bg-amber-100 p-1.5">
                            <Star className="h-4 w-4 text-amber-600" />
                          </span>
                          Ratings & Reviews
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${star <= Math.round(selectedPlaceAverageRating) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-semibold text-gray-700">
                            {selectedPlaceReviewList.length > 0 ? selectedPlaceAverageRating.toFixed(1) : "No rating"}
                          </span>
                          <span className="text-xs text-gray-500">({selectedPlaceReviewList.length} reviews)</span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm sm:p-5">
                        <p className="text-xs font-semibold text-gray-600">Rate, review, and attach photos/videos</p>
                        <p className="mt-1 text-[11px] text-emerald-700">
                          Earn Rb points: Free users get 1 for text + 1 for media. Paid and Premium users get 2 for text + 3 for media. 1 Rb = Rs 1.
                        </p>
                        <div className="mt-3 flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              className="rounded p-1 transition-colors hover:bg-amber-100"
                              aria-label={`Rate ${star} stars`}
                            >
                              <Star className={`h-5 w-5 ${star <= reviewRating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                            </button>
                          ))}
                          <span className="ml-2 text-xs text-gray-500">{reviewRating > 0 ? `${reviewRating}/5 selected` : "Tap stars to rate"}</span>
                        </div>
                        <input
                          type="text"
                          value={reviewText}
                          onChange={(event) => setReviewText(event.target.value)}
                          placeholder="Write your review (optional)..."
                          className="mt-3 w-full rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                        />
                        <input
                          ref={reviewMediaInputRef}
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          onChange={handleReviewMediaFileChange}
                          className="hidden"
                        />
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={() => reviewMediaInputRef.current?.click()}
                            className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <ImageIcon className="mr-1.5 h-4 w-4" />
                            Choose Files
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitPlaceReview()}
                            disabled={reviewSubmitting || (!reviewText.trim() && reviewMediaFiles.length === 0 && reviewRating === 0)}
                            className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                          >
                            {reviewSubmitting ? "Posting..." : "Post Review + Media"}
                          </button>
                        </div>
                        {reviewMediaFiles.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {reviewMediaFiles.map((item) => (
                              <div key={item.preview} className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                                {item.file.type.startsWith("video/") ? (
                                  <video src={item.preview} controls playsInline className="h-24 w-full object-cover bg-black" />
                                ) : (
                                  <img src={item.preview} alt="Selected review media" className="h-24 w-full object-cover" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-[11px] text-gray-500">Selected files will be posted with this review text when you tap Post Review.</p>
                        {reviewRewardMessage && <p className="mt-2 text-xs font-semibold text-emerald-700">{reviewRewardMessage}</p>}
                        {reviewUploadError && <p className="mt-2 text-xs text-red-600">{reviewUploadError}</p>}
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                        {selectedPlaceReviewList.length === 0 ? (
                          <p className="text-center text-xs text-gray-500">No reviews yet. Be the first to rate this place.</p>
                        ) : (
                          <div className="max-h-128 space-y-3 overflow-y-auto pr-1">
                            {selectedPlaceReviewList.map((review) => (
                              <div key={review.id} className="rounded-xl border border-gray-100 bg-white p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-gray-800">{review.author}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-amber-600">{review.rating}/5</span>
                                    {user?.uid && review.userId === user.uid && (
                                      <button
                                        type="button"
                                        onClick={() => void deletePlaceReview(review.id)}
                                        disabled={deletingReviewId === review.id}
                                        className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white p-1 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        aria-label="Delete your review"
                                        title="Delete your review"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {review.text && <p className="mt-1 text-sm text-gray-600">{review.text}</p>}
                                {review.media.length > 0 && (
                                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {review.media.map((mediaItem, mediaIndex) => (
                                      <a
                                        key={mediaItem.publicId || mediaItem.url || `media-${mediaIndex}`}
                                        href={mediaItem.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group overflow-hidden rounded-xl border border-rose-100 bg-rose-50/30 shadow-sm"
                                        title="Open media"
                                      >
                                        <div className="relative h-24 w-full bg-black/80">
                                          {mediaItem.type === "video" ? (
                                            mediaItem.thumbnail ? (
                                              <img
                                                src={mediaItem.thumbnail}
                                                alt={mediaItem.caption ?? "Review video"}
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                              />
                                            ) : (
                                              <video
                                                src={mediaItem.url}
                                                className="h-full w-full object-cover"
                                                muted
                                                playsInline
                                                preload="metadata"
                                              />
                                            )
                                          ) : (
                                            <img
                                              src={mediaItem.url}
                                              alt={mediaItem.caption ?? "Review photo"}
                                              loading="lazy"
                                              decoding="async"
                                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                            />
                                          )}
                                          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            {mediaItem.type === "video" ? "Video" : "Photo"}
                                          </span>
                                        </div>
                                        {mediaItem.caption && (
                                          <p className="line-clamp-2 px-2 py-1 text-[11px] font-medium text-rose-700">
                                            {mediaItem.caption}
                                          </p>
                                        )}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                          <span className="rounded-lg bg-rose-100 p-1.5">
                            <Share2 className="h-4 w-4 text-rose-600" />
                          </span>
                          Share This Place
                        </h3>
                        {shareCopied && <span className="text-xs font-semibold text-emerald-600">Copied!</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePlaceShare("whatsapp")}
                          className="inline-flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
                        >
                          <Globe className="h-4 w-4" /> WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePlaceShare("facebook")}
                          className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Facebook className="h-4 w-4" /> Facebook
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePlaceShare("copy")}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
                        >
                          {shareCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          {shareCopied ? "Copied!" : "Copy Link"}
                        </button>
                      </div>
                      {selectedPlaceMapPreviewUrl && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <MapPin className="h-4 w-4 text-rose-500" />
                              Google Maps Preview
                            </h3>
                            {selectedPlace.googleMapsUrl && (
                              <a
                                href={selectedPlace.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                              >
                                Open in Google Maps
                              </a>
                            )}
                          </div>
                          <iframe
                            title={`Google Maps preview for ${selectedPlace.name}`}
                            src={selectedPlaceMapPreviewUrl}
                            loading="lazy"
                            allowFullScreen
                            referrerPolicy="no-referrer-when-downgrade"
                            className="h-72 w-full border-0"
                          />
                        </div>
                      )}
                    </section>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      <div className="space-y-4 lg:col-span-2">
                        {selectedPlace.description && (
                          <div
                            className="text-base leading-relaxed text-foreground/80 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mb-2 [&_h5]:text-base [&_h5]:font-semibold [&_h6]:mb-2 [&_h6]:text-sm [&_h6]:font-semibold"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtmlForDisplay(selectedPlace.description) }}
                          />
                        )}

                        {Array.isArray(selectedPlace.extraInfo) && selectedPlace.extraInfo.length > 0 && (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {selectedPlace.extraInfo.map((info, idx) => (
                              <div key={info.id || `${info.heading}-${idx}`} className="rounded-2xl border border-border bg-muted/40 p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
                                  <FileText className="h-4 w-4 text-rose-500" />
                                  {info.heading}
                                </div>
                                <p className="text-sm leading-relaxed text-foreground/75">{info.description}</p>
                              </div>
                            ))}
                          </div>
                        )}

                      </div>

                      <div className="rounded-2xl border border-border bg-muted/40 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Stats</div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-foreground/80">
                          <ImageIcon className="h-4 w-4 text-rose-500" />
                          <span>{selectedPlace.media?.length || 0} media files</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm text-foreground/80">
                          <MapPin className="h-4 w-4 text-rose-500" />
                          <span>{selectedPlace.category}</span>
                        </div>
                      </div>
                    </div>

                    {(selectedPlaceImages.length > 0 || selectedPlaceVideos.length > 0) && (
                      <section>
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded-lg bg-rose-100 p-1.5">
                            <ImageIcon className="h-4 w-4 text-rose-600" />
                          </span>
                          <h3 className="text-base font-bold text-gray-800">Photos</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                          {selectedPlaceImages.map((img, index) => (
                            <div key={img.publicId || img.url || `img-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                              <div className="relative aspect-square overflow-hidden">
                                <img src={img.url} alt={img.caption ?? `${selectedPlace.name} photo ${index + 1}`} className="h-full w-full object-cover" />
                                {img.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[9px] truncate text-white">{img.caption}</div>}
                              </div>
                            </div>
                          ))}
                          {selectedPlaceVideos.map((vid, index) => (
                            <div key={vid.publicId || vid.url || `vid-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                              <div className="relative aspect-video bg-black">
                                <video src={vid.url} poster={vid.thumbnail} controls playsInline preload="metadata" className="h-full w-full object-cover" />
                                {vid.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[9px] truncate text-white">{vid.caption}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TourPlaces;
