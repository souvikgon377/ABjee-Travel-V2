"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  X,
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
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import type { TouristPlace } from "@/components/ui/tourist-places";
import { firestoreDb } from "@/lib/firebaseFirestore";
import { publicAsset } from "@/lib/publicAsset";
import { useIsMobile } from "@/hooks/use-mobile";
import { htmlToPlainText, sanitizeRichTextHtmlForDisplay } from "@/lib/richTextDisplay";
import { buildAbjeeShareText } from "@/lib/socialShare";

const STATIC_VIDEO_V1 = publicAsset("/v1.mp4");

const PlaceCard: React.FC<{
  place: TouristPlace;
  idx: number;
  onSelect: () => void;
  disableVideoAutoplay?: boolean;
}> = ({ place, idx, onSelect, disableVideoAutoplay = false }) => {
  const videos = place.media?.filter((item) => item.type === "video") ?? [];
  const images = place.media?.filter((item) => item.type === "image") ?? [];
  const hasVideo = videos.length > 0;

  const [imgIdx, setImgIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const dragRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const safeDescriptionHtml = place.description ? sanitizeRichTextHtmlForDisplay(place.description) : "";

  useEffect(() => {
    if (hasVideo || images.length <= 1) return;
    const timer = window.setInterval(() => {
      setImgIdx((current) => (current + 1) % images.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [hasVideo, images.length]);

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
        ) : images.length > 0 ? (
          <>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={imgIdx}
                src={images[imgIdx].url}
                alt={images[imgIdx].caption ?? place.name}
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
};

const TourPlaces: React.FC = () => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const handledPlaceParamRef = useRef<string | null>(null);

  const [searchDestination, setSearchDestination] = useState("");
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);
  const [firestorePlaces, setFirestorePlaces] = useState<TouristPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<TouristPlace | null>(null);
  const [isWindowExpanded, setIsWindowExpanded] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [openPhotoCommentKey, setOpenPhotoCommentKey] = useState<string | null>(null);
  const [photoCommentInputs, setPhotoCommentInputs] = useState<Record<string, string>>({});
  const [photoComments, setPhotoComments] = useState<Record<string, Array<{ author: string; text: string }>>>({});
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");

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
    const q = query(collection(firestoreDb, "touristPlaces"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TouristPlace, "id">) }));
      setFirestorePlaces(items);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (firestorePlaces.length === 0) return;

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

    const match = firestorePlaces.find((place) =>
      place.name
        ?.toLowerCase()
        .replace(/\s+/g, " ")
        .trim() === normalizedQuery,
    );

    if (!match) return;

    handledPlaceParamRef.current = normalizedQuery;
    setSelectedPlace(match);
    setSearchDestination((prev) => prev || match.name);
  }, [firestorePlaces]);

  const filteredPlaces = useMemo(() => {
    const q = searchDestination.trim().toLowerCase();
    if (!q) return firestorePlaces;
    return firestorePlaces.filter((place) =>
      [place.name, place.area, place.state, place.country, place.category, htmlToPlainText(place.description ?? "")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [firestorePlaces, searchDestination]);

  const searchQuery = searchDestination.trim();
  const showSuggestions = searchQuery.length === 0;
  const suggestionPlaces = ["Tirupati", "Manali", "Goa", "Kerala", "Shimla", "Ladakh"];

  const selectedPlaceImages = useMemo(() => selectedPlace?.media?.filter((item) => item.type === "image") ?? [], [selectedPlace?.media]);
  const selectedPlaceVideos = useMemo(() => selectedPlace?.media?.filter((item) => item.type === "video") ?? [], [selectedPlace?.media]);

  const closeSelectedPlace = () => {
    setSelectedPlace(null);
    setIsWindowExpanded(false);
    setOpenPhotoCommentKey(null);
    setReviewRating(0);
    setReviewText("");
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

  const submitPhotoComment = (key: string) => {
    const text = (photoCommentInputs[key] ?? "").trim();
    if (!text) return;
    setPhotoComments((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { author: "You", text }],
    }));
    setPhotoCommentInputs((prev) => ({ ...prev, [key]: "" }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeInOut" }}
      className="relative min-h-screen overflow-x-hidden bg-black/80"
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
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
                  value={searchDestination}
                  onChange={(event) => setSearchDestination(event.target.value)}
                  className="w-full rounded-full bg-white/95 py-3.5 pl-12 pr-10 text-sm text-gray-900 shadow-2xl shadow-black/40 backdrop-blur-xl placeholder:text-gray-400 focus:outline-none sm:py-4 sm:pl-14 sm:pr-12 sm:text-base"
                />
                {searchDestination && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchDestination("");
                      setSelectedPlace(null);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-rose-100 hover:text-rose-500"
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
                        setSearchDestination(placeName);
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
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md">
                    <MapPin className="h-4 w-4 text-rose-400" />
                    {filteredPlaces.length} of {firestorePlaces.length} places for “{searchQuery}”
                  </span>
                </div>

                <motion.div className="w-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {filteredPlaces.map((place, idx) => (
                      <PlaceCard
                        key={place.id ?? idx}
                        place={place}
                        idx={idx}
                        onSelect={() => setSelectedPlace(place)}
                        disableVideoAutoplay={mobilePerformanceMode || isMobile}
                      />
                    ))}
                  </div>
                </motion.div>
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
                              <Star key={star} className="h-4 w-4 text-gray-300" />
                            ))}
                          </div>
                          <span className="text-sm font-semibold text-gray-700">No rating</span>
                          <span className="text-xs text-gray-500">(0 reviews)</span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm sm:p-5">
                        <p className="text-xs font-semibold text-gray-600">Rate, review, and attach photos/videos</p>
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
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <ImageIcon className="mr-1.5 h-4 w-4" />
                            Choose Files
                          </button>
                          <button
                            type="button"
                            disabled={reviewRating === 0}
                            className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
                          >
                            Post Review + Media
                          </button>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">Selected files will be posted with this review text when you tap Post Review.</p>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 text-center text-xs text-gray-500 shadow-sm">
                        No reviews yet. Be the first to rate this place.
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
                    </section>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      <div className="space-y-4 lg:col-span-2">
                        {selectedPlace.description && (
                          <div
                            className="text-base leading-relaxed text-foreground/80 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1 [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-black [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mb-2 [&_h5]:text-base [&_h5]:font-semibold [&_h6]:mb-2 [&_h6]:text-sm [&_h6]:font-semibold"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtmlForDisplay(selectedPlace.description) }}
                          />
                        )}

                        {selectedPlace.extraInfo.length > 0 && (
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {selectedPlace.extraInfo.map((info) => (
                              <div key={info.id} className="rounded-2xl border border-border bg-muted/40 p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-foreground">
                                  <FileText className="h-4 w-4 text-rose-500" />
                                  {info.heading}
                                </div>
                                <p className="text-sm leading-relaxed text-foreground/75">{info.description}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedPlace.googleMapsUrl && (
                          <a
                            href={selectedPlace.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                          >
                            <MapPin className="h-4 w-4" /> View on Google Maps
                          </a>
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
                            <div key={`${img.url}-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                              <div className="relative aspect-square overflow-hidden">
                                <img src={img.url} alt={img.caption ?? `${selectedPlace.name} photo ${index + 1}`} className="h-full w-full object-cover" />
                                {img.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[9px] truncate text-white">{img.caption}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={() => setOpenPhotoCommentKey(openPhotoCommentKey === `image_${index}` ? null : `image_${index}`)}
                                className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-xs text-gray-500 hover:text-rose-500"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                {photoComments[`image_${index}`]?.length ? `${photoComments[`image_${index}`].length} comment${photoComments[`image_${index}`].length > 1 ? 's' : ''}` : 'Add comment'}
                              </button>
                              <AnimatePresence>
                                {openPhotoCommentKey === `image_${index}` && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t border-gray-100"
                                  >
                                    <div className="space-y-2 p-3">
                                      {(photoComments[`image_${index}`] ?? []).length === 0 && (
                                        <p className="text-[10px] text-gray-400 text-center py-1">No comments yet</p>
                                      )}
                                      {(photoComments[`image_${index}`] ?? []).map((comment, commentIndex) => (
                                        <div key={commentIndex} className="rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-2 text-xs text-gray-700">
                                          <span className="font-semibold text-gray-600">{comment.author}:</span> {comment.text}
                                        </div>
                                      ))}
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="text"
                                          value={photoCommentInputs[`image_${index}`] ?? ''}
                                          onChange={(event) => setPhotoCommentInputs((prev) => ({ ...prev, [`image_${index}`]: event.target.value }))}
                                          onKeyDown={(event) => { if (event.key === 'Enter') submitPhotoComment(`image_${index}`); }}
                                          placeholder="Write a comment..."
                                          className="min-w-0 flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => submitPhotoComment(`image_${index}`)}
                                          className="rounded-full bg-rose-500 p-2 text-white hover:bg-rose-600"
                                        >
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ))}
                          {selectedPlaceVideos.map((vid, index) => (
                            <div key={`${vid.url}-${index}`} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md">
                              <div className="relative aspect-video bg-black">
                                <video src={vid.url} poster={vid.thumbnail} controls playsInline preload="metadata" className="h-full w-full object-cover" />
                                {vid.caption && <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[9px] truncate text-white">{vid.caption}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={() => setOpenPhotoCommentKey(openPhotoCommentKey === `video_${index}` ? null : `video_${index}`)}
                                className="flex w-full items-center gap-1.5 border-t border-gray-100 px-3 py-2 text-xs text-gray-500 hover:text-rose-500"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                {photoComments[`video_${index}`]?.length ? `${photoComments[`video_${index}`].length} comment${photoComments[`video_${index}`].length > 1 ? 's' : ''}` : 'Add comment'}
                              </button>
                              <AnimatePresence>
                                {openPhotoCommentKey === `video_${index}` && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t border-gray-100"
                                  >
                                    <div className="space-y-2 p-3">
                                      {(photoComments[`video_${index}`] ?? []).length === 0 && (
                                        <p className="text-[10px] text-gray-400 text-center py-1">No comments yet</p>
                                      )}
                                      {(photoComments[`video_${index}`] ?? []).map((comment, commentIndex) => (
                                        <div key={commentIndex} className="rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-2 text-xs text-gray-700">
                                          <span className="font-semibold text-gray-600">{comment.author}:</span> {comment.text}
                                        </div>
                                      ))}
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="text"
                                          value={photoCommentInputs[`video_${index}`] ?? ''}
                                          onChange={(event) => setPhotoCommentInputs((prev) => ({ ...prev, [`video_${index}`]: event.target.value }))}
                                          onKeyDown={(event) => { if (event.key === 'Enter') submitPhotoComment(`video_${index}`); }}
                                          placeholder="Write a comment..."
                                          className="min-w-0 flex-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => submitPhotoComment(`video_${index}`)}
                                          className="rounded-full bg-rose-500 p-2 text-white hover:bg-rose-600"
                                        >
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
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
