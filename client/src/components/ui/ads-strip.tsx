"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { CalendarDays, MapPin, Phone, Tag, User } from 'lucide-react';
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
          };
        });

        const approvedRows = rows.filter((row) => row.photoUrl && (row.status === 'approved' || row.approvalStatus === 'approved'));
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
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-4">
                        <div className="truncate text-sm font-semibold">{item.name}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/65">Click to view details</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 rounded-2xl bg-[#121212] p-4 text-white backface-hidden transform-[rotateY(180deg)]">
                    <div className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                      <div>
                        <div className="mt-2 text-base font-semibold leading-tight">{item.name}</div>
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
                  <Badge variant="outline" className="border-green-500/60 bg-green-500/10 text-green-300">
                    {selectedItem.approvalStatus || selectedItem.status || 'approved'}
                  </Badge>
                  {selectedItem.category && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/80">
                      {selectedItem.category}
                    </Badge>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow icon={<MapPin className="h-4 w-4" />} label="Location" value={[selectedItem.area, selectedItem.state, selectedItem.country].filter(Boolean).join(', ') || 'Not available'} />
                  <DetailRow icon={<Phone className="h-4 w-4" />} label="Mobile number" value={selectedItem.mobileNumber || 'Not available'} />
                  <DetailRow icon={<Tag className="h-4 w-4" />} label="Email" value={selectedItem.ownerEmail || 'Not available'} />
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Created" value={formatDateTime(selectedItem.createdAt)} />
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Updated" value={formatDateTime(selectedItem.updatedAt)} />
                  <DetailRow icon={<CalendarDays className="h-4 w-4" />} label="Approved" value={formatDateTime(selectedItem.approvedAt)} />
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/55">Description</h4>
                  <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/80">
                    {selectedItem.description || 'No description available for this advertisement.'}
                  </p>
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