'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';

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
    const timer = window.setTimeout(() => setIsOpen(true), 1800);
    return () => window.clearTimeout(timer);
  }, [activeOffers.length]);

  useEffect(() => {
    if (!isOpen || activeOffers.length <= 1) return;
    const rotator = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % activeOffers.length);
    }, 5200);

    return () => window.clearInterval(rotator);
  }, [isOpen, activeOffers.length]);

  const closePopup = () => {
    setIsOpen(false);
  };

  if (!currentOffer) return null;

  return (
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
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-rose-300/40 bg-linear-to-br from-rose-50/95 via-orange-50/95 to-amber-50/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:from-rose-950/80 dark:via-orange-950/70 dark:to-amber-950/80 sm:p-7"
          >
            <motion.div
              className="pointer-events-none absolute -inset-20 bg-radial from-rose-400/20 to-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            />

            <button
              type="button"
              onClick={closePopup}
              className="absolute right-4 top-4 z-20 rounded-full border border-rose-300/60 bg-white/80 p-1.5 text-rose-700 transition-colors hover:bg-white dark:bg-black/35 dark:text-rose-200"
              aria-label="Close offer popup"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative">
              <p className="inline-flex items-center gap-1 rounded-full border border-rose-300/70 bg-white/75 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:bg-black/25 dark:text-rose-200">
                <Sparkles className="h-3 w-3" />
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
                  <h3 className="mt-2 text-2xl font-extrabold leading-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
                    {currentOffer.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-base text-zinc-700 dark:text-zinc-300">
                    {currentOffer.description}
                  </p>

                  <Link
                    href={currentOffer.ctaHref || '/chat'}
                    onClick={closePopup}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-rose-500 to-orange-500 px-5 py-3 text-sm font-bold text-white transition-all hover:from-rose-600 hover:to-orange-600"
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
    </AnimatePresence>
  );
}
