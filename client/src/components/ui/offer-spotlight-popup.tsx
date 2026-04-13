'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';

type OfferItem = {
  id: string;
  title: string;
  description: string;
  badge?: string;
  ctaText?: string;
  ctaHref?: string;
};

type OfferSpotlightPopupProps = {
  offers: OfferItem[];
  contextLabel?: string;
};

export default function OfferSpotlightPopup({
  offers,
  contextLabel = 'Live Offers',
}: OfferSpotlightPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const activeOffers = useMemo(() => offers.filter((offer) => Boolean(offer?.title)), [offers]);
  const currentOffer = activeOffers[index % Math.max(activeOffers.length, 1)];

  useEffect(() => {
    if (!activeOffers.length || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => setIsOpen(true), 250);
    return () => window.clearTimeout(timer);
  }, [activeOffers.length]);

  useEffect(() => {
    if (!isOpen || activeOffers.length <= 1) return;
    const rotator = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % activeOffers.length);
    }, 4200);

    return () => window.clearInterval(rotator);
  }, [isOpen, activeOffers.length]);

  const closePopup = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onEsc);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onEsc);
    };
  }, [isOpen, closePopup]);

  if (!currentOffer || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          style={{ zIndex: 120 }}
          onClick={closePopup}
        >
          <motion.div
            className="pointer-events-none absolute inset-0"
            animate={{ opacity: [0.45, 0.75, 0.45] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <div className="absolute inset-0 bg-linear-to-br from-rose-500/20 via-orange-500/10 to-amber-500/20" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            data-lenis-prevent
            className="fixed left-1/2 top-1/2 w-[min(92vw,48rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-rose-300/40 bg-linear-to-br from-rose-50/95 via-orange-50/95 to-amber-50/95 p-6 shadow-[0_32px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl dark:from-rose-950/80 dark:via-orange-950/70 dark:to-amber-950/80 sm:p-8"
            style={{ maxHeight: 'calc(100vh - 2rem)' }}
          >
            <motion.div
              className="pointer-events-none absolute -inset-20 bg-radial from-rose-400/20 to-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="pointer-events-none absolute -right-18 -top-16 h-52 w-52 rounded-full bg-amber-300/35 blur-3xl"
              animate={{ x: [0, 10, 0], y: [0, -8, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-rose-400/30 blur-3xl"
              animate={{ x: [0, -10, 0], y: [0, 10, 0] }}
              transition={{ duration: 5.1, repeat: Infinity, ease: 'easeInOut' }}
            />

            <button
              type="button"
              onClick={closePopup}
              className="absolute right-4 top-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-rose-300/60 bg-white/85 p-0 text-rose-700 leading-none shadow-lg transition-all hover:scale-105 hover:bg-white active:scale-95 dark:bg-black/40 dark:text-rose-200 sm:h-11 sm:w-11"
              aria-label="Close offer popup"
            >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>

            <div className="relative">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-rose-700 dark:bg-black/25 dark:text-rose-200">
                {contextLabel}
              </p>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentOffer.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="mt-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/90 dark:text-rose-300/90">
                    {currentOffer.badge || 'Featured'}
                  </p>
                  <h3 className="mt-2 text-3xl font-black leading-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
                    {currentOffer.title}
                  </h3>
                  <p className="mt-3 line-clamp-3 text-base leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-lg">
                    {currentOffer.description}
                  </p>

                  <Link
                    href={currentOffer.ctaHref || '/chat'}
                    onClick={closePopup}
                    className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-rose-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(244,63,94,0.35)] transition-all hover:scale-[1.02] hover:from-rose-600 hover:to-orange-600"
                  >
                    {currentOffer.ctaText || 'Explore Now'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </AnimatePresence>

              {activeOffers.length > 1 && (
                <div className="mt-3 flex items-center gap-1.5">
                  {activeOffers.map((offer, dotIndex) => (
                    <button
                      key={offer.id}
                      onClick={() => setIndex(dotIndex)}
                      className={`h-1.5 rounded-full transition-all ${dotIndex === index ? 'w-5 bg-rose-500' : 'w-1.5 bg-rose-300/70'}`}
                      aria-label={`Show offer ${dotIndex + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
