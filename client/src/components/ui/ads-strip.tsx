"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore';
import { MapPin, MessageSquare, Phone, Tag, Star, Trash2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { firestoreDb } from '@/lib/firebaseFirestore';
import type { TouristPlace } from '@/components/ui/tourist-places';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';

type AdItem = {
  id: string;
  photoUrl?: string;
  name?: string;
  mobileNumber?: string;
  category?: string;
  description?: string;
  country?: string;
  state?: string;
  area?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhoneNumber?: string;
  status?: string;
  approvalStatus?: string;
  createdAt?: any;
  approvedAt?: any;
  updatedAt?: any;
  rating?: number;
  comments?: any[];
  subscriptionExpiresAt?: string;
  score?: number;
  userRatings?: Record<string, number>;
  adType?: 'standard' | 'affiliate';
  affiliateProvider?: string;
  affiliateLink?: string;
  widgetHref?: string;
  partnerId?: string;
  localeCode?: string;
  tourIds?: string;
  numberOfItems?: number;
};

type AdsStripProps = {
  maxItems?: number;
  searchTerm?: string;
  places?: TouristPlace[];
};

function AffiliateAdCard({ item, onReviews }: { item: AdItem; onReviews: () => void }) {
  const [isCardHovered, setIsCardHovered] = useState(false);

  return (
    <div className="relative h-64 w-full perspective-distant">
      <a
        href={item.affiliateLink}
        target="_blank"
        rel="sponsored"
        className="block h-full w-full text-left"
        aria-label={`Open ${item.name || 'activity'} with ABjee Travel`}
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
        onFocus={() => setIsCardHovered(true)}
        onBlur={() => setIsCardHovered(false)}
      >
        <div className={`relative h-full w-full rounded-2xl border border-white/15 shadow-lg shadow-black/20 transition-transform duration-700 ease-out transform-3d ${isCardHovered ? 'transform-[rotateY(180deg)]' : ''}`}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white backface-hidden">
          <div
            data-gyg-href={item.widgetHref}
            data-gyg-locale-code={item.localeCode || 'en-US'}
            data-gyg-widget="activities"
            data-gyg-number-of-items={String(item.numberOfItems || 1)}
            data-gyg-partner-id={item.partnerId || 'P2598GX'}
            data-gyg-tour-ids={item.tourIds}
            className="pointer-events-none min-h-64 w-full origin-top bg-white transform-[scale(1.65)]"
          >
            <span className="flex h-64 items-center justify-center text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Book with ABjee Travel</span>
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-black via-black/95 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
            <div className="line-clamp-2 text-base font-semibold leading-tight drop-shadow-md">{item.name}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/70">Click to view details</div>
          </div>
        </div>

        <div className="absolute inset-0 rounded-2xl bg-[#121212] p-4 text-white backface-hidden transform-[rotateY(180deg)]">
          <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div>
              <div className="mt-2 text-base font-semibold leading-tight">{item.name}</div>
              <div className="mt-2 flex items-center gap-1" aria-label={`Average rating ${Number(item.rating || 0).toFixed(1)} out of 5`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-4 w-4 ${star <= (item.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`}
                  />
                ))}
                <span className="ml-1 text-xs text-white/60">
                  {item.rating ? `(${Number(item.rating).toFixed(1)})` : '(No ratings)'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm leading-5 text-white/80 line-clamp-3 overflow-hidden">
                {item.description || 'Book this activity securely with ABjee Travel.'}
              </p>
              <div className="h-px w-full bg-white/10" />
              <div className="text-xs text-white/55">Click to view and book with ABjee Travel.</div>
            </div>
          </div>
        </div>
        </div>
      </a>
      <div
        className="absolute right-0 top-0 z-20 flex h-20 w-40 items-start justify-end p-3"
        onMouseEnter={() => setIsCardHovered(false)}
      >
        <button
          type="button"
          onClick={onReviews}
          className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur backface-hidden transform-3d transition-[transform,background-color] duration-700 ease-out hover:bg-black/90 ${isCardHovered ? 'transform-[rotateY(180deg)]' : ''}`}
          aria-label={`Rate and review ${item.name || 'this activity'}`}
        >
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          {item.rating ? Number(item.rating).toFixed(1) : 'Rate'}
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

const getTime = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Number(new Date(value)) || 0;
};

const PLACE_COUNTRY_MAPPING: Record<string, string> = {
  // United States
  'grand canyon': 'united states',
  'san francisco': 'united states',
  'new york': 'united states',
  'los angeles': 'united states',
  'chicago': 'united states',
  'houston': 'united states',
  'phoenix': 'united states',
  'philadelphia': 'united states',
  'san antonio': 'united states',
  'san diego': 'united states',
  'dallas': 'united states',
  'san jose': 'united states',
  'austin': 'united states',
  'jacksonville': 'united states',
  'fort worth': 'united states',
  'columbus': 'united states',
  'charlotte': 'united states',
  'seattle': 'united states',
  'denver': 'united states',
  'washington': 'united states',
  'boston': 'united states',
  'las vegas': 'united states',
  'arizona': 'united states',
  'california': 'united states',
  'texas': 'united states',
  'florida': 'united states',
  'nevada': 'united states',
  'colorado': 'united states',

  // Australia
  'melbourne': 'australia',
  'sydney': 'australia',
  'brisbane': 'australia',
  'perth': 'australia',
  'adelaide': 'australia',
  'gold coast': 'australia',
  'canberra': 'australia',
  'hobart': 'australia',
  'darwin': 'australia',
  'victoria': 'australia',
  'new south wales': 'australia',
  'queensland': 'australia',
  'western australia': 'australia',
  'south australia': 'australia',
  'tasmania': 'australia',

  // India
  'delhi': 'india',
  'mumbai': 'india',
  'kolkata': 'india',
  'chennai': 'india',
  'bangalore': 'india',
  'bengaluru': 'india',
  'hyderabad': 'india',
  'pune': 'india',
  'goa': 'india',
  'kerala': 'india',
  'rajasthan': 'india',
  'west bengal': 'india',
  'sikkim': 'india',
  'darjeeling': 'india',
  'assam': 'india',
  'kabul': 'afghanistan',
};

export const getAdMatchScore = (item: AdItem, searchTerm: string, places: TouristPlace[]) => {
  const term = normalize(searchTerm);

  const adName = normalize(item.name);
  const adCategory = normalize(item.category);
  const adDesc = normalize(item.description);
  const adAreaStr = normalize(item.area);
  const adStateStr = normalize(item.state);
  const adCountryStr = normalize(item.country);

  let matched = false;
  let score = 0;

  // Split comma-separated targeting lists
  const adAreas = adAreaStr.split(',').map(s => s.trim()).filter(Boolean);
  const adStates = adStateStr.split(',').map(s => s.trim()).filter(Boolean);
  const adCountries = adCountryStr.split(',').map(s => s.trim()).filter(Boolean);

  // 1. Direct search term match on any ad fields (e.g. searching "Bike rental" or "Kolkata")
  if (term) {
    if (adName.includes(term)) {
      matched = true;
      score += 10;
    }
    if (adCategory.includes(term)) {
      matched = true;
      score += 8;
    }
    if (adDesc.includes(term)) {
      matched = true;
      score += 5;
    }
    if (adAreas.some(area => area.includes(term) || term.includes(area))) {
      matched = true;
      score += 8;
    }
    if (adStates.some(state => state.includes(term) || term.includes(state))) {
      matched = true;
      score += 6;
    }
    if (adCountries.some(country => country.includes(term) || term.includes(country))) {
      matched = true;
      score += 4;
    }

    // Heuristic country matching for queries like "Grand Canyon" mapping to "United States"
    let heuristicCountry = '';
    for (const [place, country] of Object.entries(PLACE_COUNTRY_MAPPING)) {
      if (term.includes(place) || place.includes(term)) {
        heuristicCountry = country;
        break;
      }
    }
    if (heuristicCountry && adCountries.includes(heuristicCountry)) {
      matched = true;
      score += 4;
    }
  }

  // 2. Location-based match from the searched tourist places
  if (places.length > 0) {
    let placeMatchScore = 0;
    let placeMatched = false;

    places.forEach((place) => {
      const placeCountry = normalize(place.country);
      const placeState = normalize(place.state);
      const placeCity = normalize(place.city);
      const placeArea = normalize(place.area);

      // Match Country
      const countryMatch = Boolean(placeCountry && adCountries.includes(placeCountry));
      if (countryMatch) {
        placeMatched = true;
        placeMatchScore = Math.max(placeMatchScore, 1);
      }

      // Match State
      const stateMatch = Boolean(placeState && adStates.includes(placeState));
      if (stateMatch) {
        placeMatched = true;
        placeMatchScore = Math.max(placeMatchScore, 3);
      }

      // Match Location (Area / City)
      const areaMatch = adAreas.some(adArea => {
        if (!adArea) return false;
        return (
          adArea === placeArea ||
          adArea === placeCity ||
          (placeArea && placeArea.includes(adArea)) ||
          (placeCity && placeCity.includes(adArea))
        );
      });
      if (areaMatch) {
        placeMatched = true;
        placeMatchScore = Math.max(placeMatchScore, 5);
      }
    });

    if (placeMatched) {
      matched = true;
      score += placeMatchScore;
    }
  }

  // If no search term and no places, it matches everything by default with score 0
  if (!term && places.length === 0) {
    matched = true;
  }

  return { matched, score };
};

export default function AdsStrip({ maxItems = 20, searchTerm = '', places = [] }: AdsStripProps) {
  const [items, setItems] = useState<AdItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AdItem | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const { currentUser } = useAuth();
  const [isOneColumn, setIsOneColumn] = useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isPaused = React.useRef(false);
  const resumeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const scrollPosRef = React.useRef(0);

  const handleInteractionStart = () => {
    isPaused.current = true;
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }
  };

  const handleInteractionEnd = () => {
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
    }
    resumeTimeoutRef.current = setTimeout(() => {
      isPaused.current = false;
    }, 4000); // Resume auto-sliding after 4 seconds of inactivity
  };

  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeftStart = React.useRef(0);
  const dragDistance = React.useRef(0);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    isDragging.current = true;
    startX.current = e.pageX - container.offsetLeft;
    scrollLeftStart.current = container.scrollLeft;
    dragDistance.current = 0;
    handleInteractionStart();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const container = scrollRef.current;
    if (!container) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    container.scrollLeft = scrollLeftStart.current - walk;
    scrollPosRef.current = container.scrollLeft;
    dragDistance.current = Math.abs((e.pageX - container.offsetLeft) - startX.current);
  };

  const handleMouseUpOrLeave = () => {
    if (isDragging.current) {
      isDragging.current = false;
      handleInteractionEnd();
    }
  };

  const handleContainerClickCapture = (e: React.MouseEvent) => {
    if (dragDistance.current > 8) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsOneColumn(mql.matches);
    mql.addEventListener('change', onChange);
    setIsOneColumn(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const [adRating, setAdRating] = useState<number>(0);
  const [adComments, setAdComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);

  useEffect(() => {
    if (selectedItem) {
      const currentUserId = currentUser?.uid || currentUser?.id;
      const userSpecificRating = (currentUserId && selectedItem.userRatings?.[currentUserId]) || 0;
      setAdRating(userSpecificRating);
      setAdComments(selectedItem.comments || []);
    }
  }, [selectedItem, currentUser]);

  const handleRate = async (newRating: number) => {
    if (!selectedItem) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      alert("Please log in to rate this advertisement.");
      return;
    }

    try {
      const docRef = doc(firestoreDb, 'advertisements', selectedItem.id);
      let finalAvgRating = newRating;

      await runTransaction(firestoreDb, async (transaction) => {
        const adDoc = await transaction.get(docRef);
        if (!adDoc.exists()) throw new Error("Advertisement does not exist!");
        
        const data = adDoc.data();
        const userRatings = data.userRatings || {};
        userRatings[currentUserId] = newRating;
        
        let total = 0;
        let count = 0;
        for (const uid in userRatings) {
          total += Number(userRatings[uid]);
          count++;
        }
        
        // Calculate average to 1 decimal place
        finalAvgRating = count > 0 ? Number((total / count).toFixed(1)) : newRating;
        
        transaction.update(docRef, { userRatings, rating: finalAvgRating });
      });

      setAdRating(finalAvgRating);
      selectedItem.rating = finalAvgRating;
      if (!selectedItem.userRatings) selectedItem.userRatings = {};
      selectedItem.userRatings[currentUserId] = newRating;

      // Trigger Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      if (token) {
        await fetch('/api/advertisements/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: selectedItem.id, action: 'upsert' }),
        }).catch((err) => console.error('Failed to trigger sync for rating', err));
      }
    } catch (err) {
      console.error('Failed to save rating:', err);
      alert('Failed to save your rating.');
    }
  };

  const handleDeleteComment = async (commentToDelete: any) => {
    if (!selectedItem) return;
    try {
      const docRef = doc(firestoreDb, 'advertisements', selectedItem.id);
      await updateDoc(docRef, {
        comments: arrayRemove(commentToDelete)
      });
      const updatedComments = adComments.filter((c) => c.id !== commentToDelete.id);
      setAdComments(updatedComments);
      selectedItem.comments = updatedComments;

      // Trigger Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: selectedItem.id, action: 'upsert' }),
      }).catch((err) => console.error('Failed to trigger sync for delete comment', err));
    } catch (err) {
      console.error('Failed to delete comment:', err);
      alert('Failed to delete comment.');
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !newCommentText.trim()) return;

    setCommentPosting(true);
    try {
      const commentPayload = {
        id: Math.random().toString(36).substring(2, 9),
        userName: currentUser?.displayName || currentUser?.email || 'Anonymous Traveler',
        text: newCommentText.trim(),
        createdAt: new Date().toISOString(),
      };

      const docRef = doc(firestoreDb, 'advertisements', selectedItem.id);
      await updateDoc(docRef, {
        comments: arrayUnion(commentPayload),
      });

      setAdComments((prev) => [...prev, commentPayload]);

      if (!selectedItem.comments) {
        selectedItem.comments = [];
      }
      selectedItem.comments.push(commentPayload);

      setNewCommentText('');

      // Trigger Typesense sync
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      await fetch('/api/advertisements/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: selectedItem.id, action: 'upsert' }),
      }).catch((err) => console.error('Failed to trigger sync for comment', err));
    } catch (err) {
      console.error('Failed to post comment:', err);
      alert('Failed to post comment. Please try again.');
    } finally {
      setCommentPosting(false);
    }
  };

  const slidingItems = useMemo(() => {
    if (items.length === 0) return [];
    return [...items, ...items];
  }, [items]);

  const shouldAnimate = !shouldReduceMotion && (items.length > 4 || (items.length > 1 && isOneColumn));

  useEffect(() => {
    if (!shouldAnimate) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const container = scrollRef.current;
      if (container) {
        if (!isPaused.current) {
          const delta = time - lastTime;
          // Approximately 35px per second
          const step = delta * 0.035;
          scrollPosRef.current += step;

          const halfWidth = container.scrollWidth / 2;
          if (scrollPosRef.current >= halfWidth) {
            scrollPosRef.current -= halfWidth;
          }
          container.scrollLeft = Math.round(scrollPosRef.current);
        } else {
          // Sync float position tracker with actual scroll position during manual drags
          scrollPosRef.current = container.scrollLeft;
        }
      }
      lastTime = time;
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (resumeTimeoutRef.current) {
        clearTimeout(resumeTimeoutRef.current);
      }
    };
  }, [shouldAnimate, items.length]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch('/api/advertisements/list?limit=1000');
        if (!response.ok) return;
        const payload = await response.json();
        if (!mounted) return;

        const rows: AdItem[] = (payload.data?.data || []).map((data: any) => {
          const status = String(data.status || '').toLowerCase();
          const approvalStatus = String(data.approvalStatus || '').toLowerCase();

          return {
            id: data.id,
            photoUrl: String(data.photoUrl || ''),
            name: typeof data.name === 'string' ? data.name : '',
            mobileNumber: typeof data.mobileNumber === 'string' ? data.mobileNumber : '',
            category: typeof data.category === 'string' ? data.category : '',
            description: typeof data.description === 'string' ? data.description : '',
            country: typeof data.country === 'string' ? data.country : '',
            state: typeof data.state === 'string' ? data.state : '',
            area: typeof data.area === 'string' ? data.area : '',
            ownerName: typeof data.ownerName === 'string' ? data.ownerName : '',
            ownerEmail: typeof data.ownerEmail === 'string' ? data.ownerEmail : '',
            ownerPhoneNumber: typeof data.ownerPhoneNumber === 'string' ? data.ownerPhoneNumber : '',
            status,
            approvalStatus,
            createdAt: data.createdAt,
            approvedAt: data.approvedAt,
            updatedAt: data.updatedAt,
            subscriptionExpiresAt: typeof data.subscriptionExpiresAt === 'string' ? data.subscriptionExpiresAt : '',
            rating: typeof data.rating === 'number' ? data.rating : (Number(data.rating) || 0),
            userRatings: typeof data.userRatings === 'object' && data.userRatings !== null ? data.userRatings : {},
            comments: (() => {
              if (typeof data.comments === 'string') {
                try {
                  return JSON.parse(data.comments);
                } catch (e) {
                  console.error('Failed to parse comments JSON:', e);
                  return [];
                }
              }
              return Array.isArray(data.comments) ? data.comments : [];
            })(),
            adType: data.adType === 'affiliate' ? 'affiliate' : 'standard',
            affiliateProvider: typeof data.affiliateProvider === 'string' ? data.affiliateProvider : '',
            affiliateLink: typeof data.affiliateLink === 'string' ? data.affiliateLink : '',
            widgetHref: typeof data.widgetHref === 'string' ? data.widgetHref : '',
            partnerId: typeof data.partnerId === 'string' ? data.partnerId : '',
            localeCode: typeof data.localeCode === 'string' ? data.localeCode : '',
            tourIds: typeof data.tourIds === 'string' ? data.tourIds : '',
            numberOfItems: Math.min(4, Math.max(1, Number(data.numberOfItems) || 1)),
          };
        });

        const approvedRows = rows.filter((row) => {
          const hasCreative = row.adType === 'affiliate'
            ? Boolean(row.affiliateLink && row.widgetHref && row.partnerId && row.tourIds)
            : Boolean(row.photoUrl);
          const isApproved = hasCreative && (row.status === 'approved' || row.approvalStatus === 'approved');
          if (!isApproved) return false;
          if (row.subscriptionExpiresAt) {
            try {
              if (new Date(row.subscriptionExpiresAt).getTime() < Date.now()) {
                return false;
              }
            } catch {
              // ignore invalid dates
            }
          }
          return true;
        });
        const scoredItems = approvedRows.map((row) => {
          const { matched, score } = getAdMatchScore(row, searchTerm, places);
          return { row, matched, score };
        });

        const matchedRows = scoredItems
          .filter((item) => item.matched)
          .map((item) => ({ ...item.row, score: item.score }));
        
        // Show ONLY matched rows if there is a search filter applied. Do not fall back to all approved rows.
        const hasFilter = Boolean(normalize(searchTerm) || places.length > 0);
        const nextItems = hasFilter 
          ? matchedRows 
          : approvedRows.map(row => ({ ...row, score: 0 }));

        setItems(
          nextItems
            .sort((left, right) => {
              // 1. Sort by match/relevance score descending
              const scoreDiff = (right.score || 0) - (left.score || 0);
              if (scoreDiff !== 0) return scoreDiff;

              // 2. Sort by star ratings descending
              const ratingDiff = (right.rating || 0) - (left.rating || 0);
              if (ratingDiff !== 0) return ratingDiff;

              // 3. Fallback to newest approved/updated first
              return getTime(right.approvedAt || right.updatedAt) - getTime(left.approvedAt || left.updatedAt);
            })
            .slice(0, maxItems)
        );
      } catch {
        // silently ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [maxItems, places, searchTerm]);

  if (!items.length) return null;

  return (
    <>
      <style>{`
        .ads-container {
          container-type: inline-size;
          width: 100%;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @media (min-width: 1024px) {
          .ad-item-marquee {
            width: calc((100cqw - 3.75rem) / 4);
            max-width: 20rem;
          }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .ad-item-marquee {
            width: calc((100cqw - 2.5rem) / 3);
            max-width: 20rem;
          }
        }
        @media (min-width: 640px) and (max-width: 767px) {
          .ad-item-marquee {
            width: calc((100cqw - 1.25rem) / 2);
            max-width: 20rem;
          }
        }
        @media (max-width: 639px) {
          .ad-item-marquee {
            width: 100cqw;
            max-width: 20rem;
          }
        }
      `}</style>

      <div className="ads-container mx-auto mt-5 w-full">
        <div className="relative w-full overflow-x-clip px-1 pb-2">
          <div className={shouldAnimate ? "pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent z-10" : "hidden"} />
          <div className={shouldAnimate ? "pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent z-10" : "hidden"} />
          <div
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onClickCapture={handleContainerClickCapture}
            onTouchStart={handleInteractionStart}
            onTouchEnd={handleInteractionEnd}
            onTouchCancel={handleInteractionEnd}
            onWheel={handleInteractionStart}
            onScroll={() => {
              if (isPaused.current && !isDragging.current) {
                handleInteractionEnd();
              }
            }}
            className={shouldAnimate 
              ? "flex overflow-x-auto scrollbar-none gap-5 pb-2 w-full cursor-grab active:cursor-grabbing select-none" 
              : "flex overflow-x-auto scrollbar-none gap-5 pb-2 w-full snap-x snap-mandatory sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:justify-items-center"
            }
            style={{ willChange: shouldAnimate ? 'scroll-position' : 'auto' }}
          >
          {(shouldAnimate ? slidingItems : items).map((item, index) => (
            <div key={`${item.id}-${index}`} className={shouldAnimate ? "ad-item-marquee shrink-0" : "ad-item w-[80vw] max-w-[20rem] shrink-0 snap-start sm:w-full"}>
              {item.adType === 'affiliate' ? (
                <AffiliateAdCard item={item} onReviews={() => setSelectedItem(item)} />
              ) : (
              <button
                type="button"
                onClick={() => setSelectedItem(item)}
                className="group h-64 w-full text-left perspective-distant"
                aria-label={`View details for ${item.name || 'advertisement'}`}
              >
                <div className="relative h-full w-full rounded-2xl border border-white/15 shadow-lg shadow-black/20 transition-transform duration-700 ease-out transform-3d group-hover:transform-[rotateY(180deg)]">
                  <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/20 text-white backface-hidden">
                    <div className="relative h-full w-full">
                      <img src={item.photoUrl} alt={item.name || 'ad'} className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-4 space-y-1">
                        <div className="truncate text-sm font-semibold">{item.name}</div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3 w-3 ${
                                star <= (item.rating || 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-white/20'
                              }`}
                            />
                          ))}
                          {item.rating ? (
                            <span className="text-[10px] text-white/70 ml-1">({Number(item.rating).toFixed(1)})</span>
                          ) : (
                            <span className="text-[10px] text-white/40 ml-1">(No ratings)</span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/65">Click to view details</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 rounded-2xl bg-[#121212] p-4 text-white backface-hidden transform-[rotateY(180deg)]">
                    <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <div>
                        <div className="mt-2 text-base font-semibold leading-tight">{item.name}</div>
                        <div className="flex items-center gap-0.5 mt-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-3.5 w-3.5 ${
                                star <= (item.rating || 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-white/20'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {item.description ? (
                          <p className="text-sm leading-5 text-white/80 line-clamp-3 overflow-hidden">{item.description}</p>
                        ) : (
                          <p className="text-sm leading-5 text-white/60">No description available for this advertisement.</p>
                        )}
                        <div className="h-px w-full bg-white/10" />
                        <div className="text-xs text-white/55">Click to open the full advertisement details.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="w-[min(92vw,52rem)] max-h-[92vh] overflow-y-auto border-white/10 bg-[#121212] p-0 text-white">
          {selectedItem && (
            <div className="space-y-0">
              {selectedItem.adType === 'affiliate' ? (
                <div className="bg-white p-4 text-slate-900">
                  <DialogTitle className="sr-only">
                    {selectedItem.name || 'ABjee Travel activity details'}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    View this activity and continue securely with ABjee Travel for booking details.
                  </DialogDescription>
                  <div
                    data-gyg-href={selectedItem.widgetHref}
                    data-gyg-locale-code={selectedItem.localeCode || 'en-US'}
                    data-gyg-widget="activities"
                    data-gyg-number-of-items={String(selectedItem.numberOfItems || 1)}
                    data-gyg-partner-id={selectedItem.partnerId || 'P2598GX'}
                    data-gyg-tour-ids={selectedItem.tourIds}
                    className="min-h-64 w-full"
                  >
                    <span className="flex min-h-64 items-center justify-center text-sm text-slate-600">
                      Powered by&nbsp;
                      <a target="_blank" rel="sponsored" href={selectedItem.affiliateLink} className="font-semibold underline">
                        ABjee Travel
                      </a>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={selectedItem.photoUrl}
                    alt={selectedItem.name || 'advertisement'}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <DialogTitle className="text-2xl font-bold text-white">{selectedItem.name || 'Advertisement details'}</DialogTitle>
                    <DialogDescription className="mt-1 text-sm text-white/70">
                      Full advertisement record and contact details.
                    </DialogDescription>
                  </div>
                </div>
              )}

              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-green-500/60 bg-green-500/10 text-green-300 capitalize">
                    {(() => {
                      const status = selectedItem.approvalStatus || selectedItem.status || 'approved';
                      return status === 'approved' ? 'verified' : status;
                    })()}
                  </Badge>
                  {selectedItem.category && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                      {selectedItem.category}
                    </Badge>
                  )}
                </div>

                {selectedItem.adType === 'affiliate' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={[selectedItem.area, selectedItem.state, selectedItem.country].filter(Boolean).join(', ') || 'Available online'} />
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        Your rating · Avg {Number(selectedItem.rating || 0).toFixed(1)}
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRate(star)}
                            className="transition-transform active:scale-95"
                            aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                          >
                            <Star className={`h-5 w-5 ${star <= adRating ? 'fill-amber-400 text-amber-400' : 'text-white/20'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <a
                      href={selectedItem.affiliateLink}
                      target="_blank"
                      rel="sponsored"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300 sm:col-span-2"
                    >
                      View activity
                    </a>
                  </div>
                ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={[selectedItem.area, selectedItem.state, selectedItem.country].filter(Boolean).join(', ') || 'Not available'} />
                  
                  {/* Rating Card */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      Your Rating (Avg: {Number(selectedItem.rating || 0).toFixed(1)})
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleRate(star)}
                          className="focus:outline-none transition-transform active:scale-95 text-white"
                          type="button"
                        >
                          <Star
                            className={`h-5 w-5 ${
                              star <= adRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-white/20'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-xs text-white/60">({Number(adRating || 0).toFixed(1)})</span>
                    </div>
                  </div>

                  <DetailRow icon={<Phone className="h-4 w-4" />} label="Mobile number" value={selectedItem.mobileNumber || 'Not available'} />
                  <DetailRow icon={<Tag className="h-4 w-4" />} label="Email" value={selectedItem.ownerEmail || 'Not available'} />
                </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Description</h4>
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/80">
                    {selectedItem.description || (selectedItem.adType === 'affiliate' ? 'Book this activity securely with ABjee Travel.' : 'No description available for this advertisement.')}
                  </p>
                </div>

                {/* Comment Section under description */}
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Comments & Reviews</h4>
                  
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {adComments.length === 0 ? (
                      <p className="text-xs text-white/45 italic">No comments posted yet. Be the first to write a comment!</p>
                    ) : (
                      adComments.map((c: any) => (
                        <div key={c.id} className="rounded-xl border border-white/5 bg-white/5 p-3 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-white/50">
                            <span className="font-semibold text-white/80">{c.userName}</span>
                            <div className="flex items-center gap-2">
                              <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c)}
                                className="text-white/40 hover:text-red-400 transition-colors p-0.5"
                                title="Delete comment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-white/90 leading-relaxed">{c.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handlePostComment} className="flex gap-2 items-start mt-2">
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="Write a comment..."
                      rows={2}
                      className="flex-1 rounded-xl border border-white/10 bg-[#1e1e1e] p-2.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 resize-none"
                    />
                    <Button
                      type="submit"
                      disabled={!newCommentText.trim() || commentPosting}
                      className="shrink-0 rounded-xl bg-rose-600 text-white hover:bg-rose-700 h-9 px-3 text-xs"
                    >
                      {commentPosting ? 'Posting...' : 'Post'}
                    </Button>
                  </form>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedItem(null)}
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
        <span className="text-white/70">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-white/85 wrap-break-word">{value}</div>
    </div>
  );
}
