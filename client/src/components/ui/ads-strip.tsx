"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { CalendarDays, MapPin, Phone, Tag, User, Star, MessageSquare, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
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
};

type AdsStripProps = {
  maxItems?: number;
  searchTerm?: string;
  places?: TouristPlace[];
};

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();

const getTime = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Number(new Date(value)) || 0;
};

const formatDateTime = (value: any) => {
  if (!value) return 'Not available';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toLocaleString();
  return new Date(value).toLocaleString();
};

const adMatchesSearch = (item: AdItem, searchTerm: string, places: TouristPlace[]) => {
  const term = normalize(searchTerm);

  if (!term && places.length === 0) {
    return true;
  }

  const adName = normalize(item.name);
  const adCategory = normalize(item.category);
  const adDesc = normalize(item.description);
  const adArea = normalize(item.area);
  const adState = normalize(item.state);
  const adCountry = normalize(item.country);

  // 1. Direct search term match on any ad fields (e.g. searching "Bike rental" or "Kolkata")
  if (term) {
    const isDirectMatch = 
      adName.includes(term) ||
      adCategory.includes(term) ||
      adDesc.includes(term) ||
      adArea.includes(term) ||
      adState.includes(term) ||
      adCountry.includes(term);
    if (isDirectMatch) return true;
  }

  // 2. Location-based match from the searched tourist places
  if (places.length > 0) {
    return places.some((place) => {
      const placeCountry = normalize(place.country);
      const placeState = normalize(place.state);
      const placeCity = normalize(place.city);
      const placeArea = normalize(place.area);

      // Match Country
      const countryMatch = Boolean(adCountry && placeCountry && adCountry === placeCountry);

      // Match State
      const stateMatch = Boolean(adState && placeState && adState === placeState);

      // Match Location (Area / City)
      const areaMatch = Boolean(adArea && (
        adArea === placeArea ||
        adArea === placeCity ||
        (placeArea && placeArea.includes(adArea)) ||
        (placeCity && placeCity.includes(adArea))
      ));

      return countryMatch || stateMatch || areaMatch;
    });
  }

  return false;
};

export default function AdsStrip({ maxItems = 20, searchTerm = '', places = [] }: AdsStripProps) {
  const [items, setItems] = useState<AdItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AdItem | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const { currentUser } = useAuth();

  const [adRating, setAdRating] = useState<number>(0);
  const [adComments, setAdComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);

  useEffect(() => {
    if (selectedItem) {
      setAdRating(selectedItem.rating || 0);
      setAdComments(selectedItem.comments || []);
    }
  }, [selectedItem]);

  const handleRate = async (newRating: number) => {
    if (!selectedItem) return;
    try {
      setAdRating(newRating);
      const docRef = doc(firestoreDb, 'advertisements', selectedItem.id);
      await updateDoc(docRef, { rating: newRating });
      selectedItem.rating = newRating;
    } catch (err) {
      console.error('Failed to save rating:', err);
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

  const reverseSlidingItems = useMemo(() => {
    if (items.length === 0) return [];
    return [...items].reverse().concat([...items].reverse());
  }, [items]);

  const shouldAnimate = !shouldReduceMotion && items.length > 4;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await fetch('/api/advertisements/list?limit=100');
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
          };
        });

        const approvedRows = rows.filter((row) => {
          const isApproved = row.photoUrl && (row.status === 'approved' || row.approvalStatus === 'approved');
          if (!isApproved) return false;
          if (row.subscriptionExpiresAt) {
            try {
              if (new Date(row.subscriptionExpiresAt).getTime() < Date.now()) {
                return false;
              }
            } catch (e) {
              // ignore invalid dates
            }
          }
          return true;
        });
        const matchedRows = approvedRows.filter((row) => adMatchesSearch(row, searchTerm, places));
        
        // Show ONLY matched rows if there is a search filter applied. Do not fall back to all approved rows.
        const hasFilter = Boolean(normalize(searchTerm) || places.length > 0);
        const nextItems = hasFilter ? matchedRows : approvedRows;

        setItems(
          nextItems
            .sort((left, right) => getTime(right.approvedAt || right.updatedAt) - getTime(left.approvedAt || left.updatedAt))
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
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-track-normal {
          animation: marquee 18s linear infinite;
        }
        .marquee-track-normal:hover {
          animation-play-state: paused;
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
        <div className={shouldAnimate ? "relative overflow-hidden px-1 pb-2" : "w-full px-1 pb-2"}>
          <div className={shouldAnimate ? "pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent z-10" : "hidden"} />
          <div className={shouldAnimate ? "pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent z-10" : "hidden"} />
          <div
            className={shouldAnimate 
              ? "marquee-track-normal flex min-w-max gap-5" 
              : "grid grid-cols-1 justify-items-center gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full"
            }
            style={{ willChange: shouldAnimate ? 'transform' : 'auto' }}
          >
          {(shouldAnimate ? slidingItems : items).map((item, index) => (
            <div key={`${item.id}-${index}`} className={shouldAnimate ? "ad-item-marquee shrink-0" : "ad-item w-full max-w-[20rem]"}>
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
                            <span className="text-[10px] text-white/70 ml-1">({item.rating}.0)</span>
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
            </div>
          ))}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="w-[min(92vw,44rem)] max-h-[92vh] overflow-y-auto border-white/10 bg-[#121212] p-0 text-white">
          {selectedItem && (
            <div className="space-y-0">
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={[selectedItem.area, selectedItem.state, selectedItem.country].filter(Boolean).join(', ') || 'Not available'} />
                  
                  {/* Rating Card */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      Rating
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
                      <span className="ml-2 text-xs text-white/60">({adRating || '0'}.0)</span>
                    </div>
                  </div>

                  <DetailRow icon={<Phone className="h-4 w-4" />} label="Mobile number" value={selectedItem.mobileNumber || 'Not available'} />
                  <DetailRow icon={<Tag className="h-4 w-4" />} label="Email" value={selectedItem.ownerEmail || 'Not available'} />
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Description</h4>
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/80">
                    {selectedItem.description || 'No description available for this advertisement.'}
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