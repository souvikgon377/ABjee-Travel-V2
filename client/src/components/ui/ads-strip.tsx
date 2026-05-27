"use client";

import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import type { TouristPlace } from '@/components/ui/tourist-places';

type AdItem = {
  id: string;
  photoUrl?: string;
  description?: string;
  name?: string;
  country?: string;
  state?: string;
  area?: string;
  status?: string;
  approvalStatus?: string;
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

const adMatchesSearch = (item: AdItem, searchTerm: string, places: TouristPlace[]) => {
  const term = normalize(searchTerm);

  if (!term && places.length === 0) {
    return true;
  }

  const adParts = [item.area, item.state, item.country, item.name, item.description].map(normalize).filter(Boolean);

  if (term && adParts.some((part) => part.includes(term) || term.includes(part))) {
    return true;
  }

  const adArea = normalize(item.area);
  const adState = normalize(item.state);
  const adCountry = normalize(item.country);

  return places.some((place) => {
    const placeLocations = [place.area, place.city, place.state].map(normalize).filter(Boolean);
    const placeState = normalize(place.state);

    return (
      (adArea && placeLocations.includes(adArea)) ||
      (adState && placeState === adState) ||
      (term && adCountry === term)
    );
  });
};

export default function AdsStrip({ maxItems = 20, searchTerm = '', places = [] }: AdsStripProps) {
  const [items, setItems] = useState<AdItem[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const snap = await getDocs(query(collection(firestoreDb, 'advertisements')));
        if (!mounted) return;

        const rows: AdItem[] = snap.docs.map((document) => {
          const data = document.data() as Record<string, any>;
          const status = String(data.status || '').toLowerCase();
          const approvalStatus = String(data.approvalStatus || '').toLowerCase();

          return {
            id: document.id,
            photoUrl: String(data.photoUrl || ''),
            description: typeof data.description === 'string' ? data.description : '',
            name: typeof data.name === 'string' ? data.name : '',
            country: typeof data.country === 'string' ? data.country : '',
            state: typeof data.state === 'string' ? data.state : '',
            area: typeof data.area === 'string' ? data.area : '',
            status,
            approvalStatus,
            approvedAt: data.approvedAt,
            updatedAt: data.updatedAt,
          };
        });

        setItems(
          rows
            .filter((row) => row.photoUrl && (row.status === 'approved' || row.approvalStatus === 'approved') && adMatchesSearch(row, searchTerm, places))
            .sort((left, right) => getTime(right.approvedAt || right.updatedAt) - getTime(left.approvedAt || left.updatedAt))
            .slice(0, maxItems)
        );
      } catch {
        // silently ignore
      }
    })();

    return () => {
      mounted = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [maxItems, places, searchTerm]);

  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;

    const step = () => {
      const child = el.querySelector<HTMLElement>('.ad-item');
      if (!child) return;

      const width = child.offsetWidth + 16;
      el.scrollBy({ left: width, behavior: 'smooth' });

      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - width) {
        setTimeout(() => {
          el.scrollTo({ left: 0, behavior: 'smooth' });
        }, 1200);
      }
    };

    timerRef.current = window.setInterval(step, 3000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [items]);

  if (!items.length) return null;

  return (
    <div className="mx-auto mt-5 w-full max-w-6xl">
      <div
        ref={ref}
        className="relative flex gap-4 overflow-x-auto overflow-y-hidden px-1 pb-2 scroll-smooth snap-x snap-mandatory scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-white/10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => (
          <div key={item.id} className="ad-item shrink-0 w-52 snap-start md:w-60 lg:w-72">
            <div className="group h-64 perspective-distant">
              <div className="relative h-full w-full rounded-2xl border border-white/15 shadow-lg shadow-black/20 transition-transform duration-700 ease-out transform-3d group-hover:transform-[rotateY(180deg)]">
                <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/20 text-white backface-hidden">
                  <div className="relative h-full w-full">
                    <img src={item.photoUrl} alt={item.name || 'ad'} className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-4">
                      <div className="truncate text-sm font-semibold">{item.name}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-white/65">Hover to view details</div>
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
                        <p className="text-sm leading-6 text-white/80">{item.description}</p>
                      ) : (
                        <p className="text-sm leading-6 text-white/60">No description available for this advertisement.</p>
                      )}
                      <div className="h-px w-full bg-white/10" />
                      <div className="text-xs text-white/55">Scroll horizontally to explore more sponsored listings.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}