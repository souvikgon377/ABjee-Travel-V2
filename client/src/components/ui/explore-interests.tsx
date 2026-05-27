'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import GoogleMapDisplay from './google-map-display';
import AdsStrip from './ads-strip';
import type { TouristPlace } from './tourist-places';

interface InterestDestination {
  id: string;
  name: string;
  description: string;
  city?: string;
  state?: string;
  country?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  icon?: string;
  bestTime?: string;
  rating?: number;
}

const DEFAULT_INTERESTS: InterestDestination[] = [
  {
    id: 'paris',
    name: 'Paris, France',
    description: 'The City of Light - Iconic landmarks, museums, and romantic atmosphere',
    latitude: 48.8566,
    longitude: 2.3522,
    bestTime: 'April-June, September-October',
    rating: 4.8,
  },
  {
    id: 'tokyo',
    name: 'Tokyo, Japan',
    description: 'Modern metropolis with ancient temples and vibrant culture',
    latitude: 35.6762,
    longitude: 139.6503,
    bestTime: 'March-May, September-November',
    rating: 4.7,
  },
  {
    id: 'bali',
    name: 'Bali, Indonesia',
    description: 'Tropical paradise with beaches, rice terraces, and temples',
    latitude: -8.6705,
    longitude: 115.2126,
    bestTime: 'April-October',
    rating: 4.6,
  },
  {
    id: 'newyork',
    name: 'New York, USA',
    description: 'The city that never sleeps - Broadway, museums, and world-class dining',
    latitude: 40.7128,
    longitude: -74.006,
    bestTime: 'May, September-October',
    rating: 4.5,
  },
  {
    id: 'dubai',
    name: 'Dubai, UAE',
    description: 'Ultra-modern city with luxury shopping, desert adventures, and iconic architecture',
    latitude: 25.2048,
    longitude: 55.2708,
    bestTime: 'October-April',
    rating: 4.6,
  },
  {
    id: 'istanbul',
    name: 'Istanbul, Turkey',
    description: 'Bridge between Europe and Asia - Bazaars, historic sites, and rich culture',
    latitude: 41.0082,
    longitude: 28.9784,
    bestTime: 'April-May, September-October',
    rating: 4.5,
  },
];

const buildAdsLocationContext = (interest: InterestDestination): TouristPlace => {
  const [firstSegment, ...otherSegments] = interest.name.split(',').map((segment) => segment.trim()).filter(Boolean);
  const lastSegment = otherSegments[otherSegments.length - 1] || '';

  return {
    name: interest.name,
    area: interest.area || firstSegment || interest.name,
    city: interest.city || firstSegment || interest.name,
    state: interest.state || '',
    country: interest.country || lastSegment,
    description: interest.description,
    category: 'Other',
    googleMapsUrl: interest.googleMapsUrl || '',
    coverImage: '',
    media: [],
    extraInfo: [],
  };
};

interface ExploreInterestsProps {
  interests?: InterestDestination[];
  showTitle?: boolean;
  maxItems?: number;
}

/**
 * Explore Your Interests Component
 * Displays a carousel of travel destinations with interactive Google Maps
 */
export default function ExploreInterests({
  interests = DEFAULT_INTERESTS,
  showTitle = true,
  maxItems,
}: ExploreInterestsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const displayInterests = typeof maxItems === 'number' ? interests.slice(0, maxItems) : interests;
  const currentInterest = displayInterests[currentIndex];
  const currentInterestLocation = useMemo(
    () => (currentInterest ? buildAdsLocationContext(currentInterest) : null),
    [currentInterest],
  );

  useEffect(() => {
    if (currentIndex >= displayInterests.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, displayInterests.length]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? displayInterests.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === displayInterests.length - 1 ? 0 : prev + 1));
  };

  const goToIndex = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <section className="w-full bg-linear-to-b from-background via-background to-muted/20 px-4 py-12 md:px-8 md:py-16">
      <div className="max-w-7xl mx-auto">
        <div className="max-h-[80vh] overflow-y-auto pr-2">
        {showTitle && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center justify-center gap-2 mb-4">
              <Compass className="h-5 w-5 text-rose-500" />
              <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                DISCOVER DESTINATIONS
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold bg-linear-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent mb-3">
              Explore Your Interests
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-3xl mx-auto">
              Discover amazing destinations around the world. Click on any location to view it on the map and plan your next adventure.
            </p>
          </motion.div>
        )}

        {currentInterest && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Map Section */}
            <motion.div
              key={currentInterest.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="order-2 lg:order-1"
            >
              <GoogleMapDisplay
                latitude={currentInterest.latitude}
                longitude={currentInterest.longitude}
                googleMapsUrl={currentInterest.googleMapsUrl}
                destination={currentInterest.name}
                title={`Map of ${currentInterest.name}`}
                zoom={12}
                height="h-96 lg:h-full lg:min-h-[500px]"
              />
            </motion.div>

            {/* Info Section */}
            <motion.div
              key={`info-${currentInterest.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="order-1 lg:order-2 flex flex-col gap-6"
            >
              {/* Destination Header */}
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-6 w-6 text-rose-500 shrink-0" />
                    <h3 className="text-3xl md:text-4xl font-bold text-foreground">
                      {currentInterest.name}
                    </h3>
                  </div>
                  {currentInterest.rating && (
                    <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 rounded-full">
                      <span className="text-lg">⭐</span>
                      <span className="font-semibold text-yellow-700 dark:text-yellow-300">
                        {currentInterest.rating}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-lg text-muted-foreground">
                  {currentInterest.description}
                </p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4">
                {currentInterest.bestTime && (
                  <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Best Time to Visit
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {currentInterest.bestTime}
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-border bg-card/50 p-4 backdrop-blur">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                    Location Marker
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {typeof currentInterest.latitude === 'number' && typeof currentInterest.longitude === 'number'
                      ? `${currentInterest.latitude.toFixed(2)}°N, ${currentInterest.longitude.toFixed(2)}°E`
                      : 'View on map'}
                  </p>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={goToPrevious}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors py-3 font-semibold text-foreground"
                  aria-label="Previous destination"
                >
                  <ChevronLeft className="h-5 w-5" />
                  Previous
                </button>
                <button
                  onClick={goToNext}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors py-3 font-semibold text-foreground"
                  aria-label="Next destination"
                >
                  Next
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Carousel Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-12 flex flex-wrap justify-center gap-3"
        >
          {displayInterests.map((interest, index) => (
            <button
              key={interest.id}
              onClick={() => goToIndex(index)}
              className={`
                px-4 py-2 rounded-full font-medium transition-all duration-300
                ${
                  index === currentIndex
                    ? 'bg-linear-to-r from-rose-500 to-orange-500 text-white shadow-lg'
                    : 'bg-card border border-border text-foreground hover:border-rose-300 hover:shadow-sm'
                }
              `}
            >
              {interest.name.split(',')[0]}
            </button>
          ))}
        </motion.div>

        {/* Sponsored Ads Strip */}
        <AdsStrip
          searchTerm={currentInterest?.name || ''}
          places={currentInterestLocation ? [currentInterestLocation] : []}
        />

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 rounded-2xl border border-border bg-linear-to-r from-rose-500/10 to-orange-500/10 p-6 md:p-8 text-center"
        >
          <h3 className="text-2xl font-bold text-foreground mb-2">
            Ready to Explore?
          </h3>
          <p className="text-muted-foreground mb-6">
            Discover more destinations and plan your perfect trip with ABJEE Travel
          </p>
          <a
            href="/travel-destinations"
            className="inline-flex items-center justify-center rounded-xl bg-linear-to-r from-rose-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:from-rose-600 hover:to-orange-600 hover:shadow-lg"
          >
            Explore All Destinations
          </a>
        </motion.div>
        </div>
      </div>
    </section>
  );
}
