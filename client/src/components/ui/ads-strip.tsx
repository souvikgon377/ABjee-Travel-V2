"use client";

import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';

type AdItem = {
  id: string;
  photoUrl?: string;
  description?: string;
  name?: string;
};

export default function AdsStrip({ maxItems = 20 }: { maxItems?: number }) {
  const [items, setItems] = useState<AdItem[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const idxRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const q = query(
          collection(firestoreDb, 'advertisements'),
          where('status', '==', 'approved'),
          orderBy('approvedAt', 'desc')
        );
        const snap = await getDocs(q);
        if (!mounted) return;
        const rows: AdItem[] = snap.docs.slice(0, maxItems).map((d) => {
          const data = d.data() as Record<string, any>;
          return {
            id: d.id,
            photoUrl: String(data.photoUrl || ''),
            description: typeof data.description === 'string' ? data.description : '',
            name: typeof data.name === 'string' ? data.name : '',
          };
        });
        setItems(rows.filter((r) => r.photoUrl));
      } catch {
        // silently ignore
      }
    })();

    return () => {
      mounted = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [maxItems]);

  useEffect(() => {
    const el = ref.current;
    if (!el || items.length === 0) return;

    // Auto-scroll by item width periodically
    const step = () => {
      if (!el) return;
      const child = el.querySelector<HTMLElement>('.ad-item');
      if (!child) return;
      const w = child.offsetWidth + 12; // gap
      el.scrollBy({ left: w, behavior: 'smooth' });
      idxRef.current += 1;
      // loop back when near end
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - w) {
        setTimeout(() => {
          el.scrollTo({ left: 0, behavior: 'smooth' });
          idxRef.current = 0;
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
    <div className="mt-8">
      <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Sponsored</h4>
      <div
        ref={ref}
        className="relative flex gap-3 overflow-x-auto overflow-y-hidden pr-4 scroll-smooth scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => (
          <div key={item.id} className="ad-item flex-shrink-0 w-48 md:w-56 lg:w-64">
            <div className="rounded-lg overflow-hidden bg-muted/10 border border-border">
              <img src={item.photoUrl} alt={item.name || 'ad'} className="h-36 w-full object-cover" />
              <div className="p-3">
                <div className="text-sm font-semibold text-foreground truncate">{item.name}</div>
                {item.description ? <div className="text-xs text-muted-foreground mt-1 line-clamp-3">{item.description}</div> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
