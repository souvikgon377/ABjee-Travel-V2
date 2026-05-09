'use client';

import React, { useMemo } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';

interface GoogleMapDisplayProps {
  latitude?: number;
  longitude?: number;
  destination?: string;
  zoom?: number;
  height?: string;
  className?: string;
  title?: string;
  showMarker?: boolean;
}

/**
 * Reusable Google Maps Component
 * Displays an embedded Google Map with location marker
 * Uses iframe for embedded maps (no API key required for basic embedding)
 */
export default function GoogleMapDisplay({
  latitude,
  longitude,
  destination = 'Paris',
  zoom = 12,
  height = 'h-96',
  className = '',
  title = 'Location',
  showMarker = true,
}: GoogleMapDisplayProps) {
  // Build the map URL
  const mapUrl = useMemo(() => {
    if (latitude && longitude) {
      // Use coordinates for more precise location
      return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d${Math.pow(2, 21 - zoom) * 128}!2d${longitude}!3d${latitude}!2m3!1f0!2f0!3f0!3m2!1i${1024}!2i${768}!4f13.1!3m3!1m2!1s0x0%3A0x0!2z${latitude}%2C${longitude}!5e0!3m2!1sen!2s`;
    }
    // Use destination name for searching
    return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3024.1234567890!2d2.3522!3d48.8566!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47e66e2964e34e2d%3A0x8ddca9ee380ef7e0!2s${encodeURIComponent(destination)}!5e0!3m2!1sen!2s`;
  }, [latitude, longitude, destination, zoom]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {title && (
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-rose-500" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
      )}
      
      <div className={`relative rounded-xl overflow-hidden border border-border shadow-sm ${height}`}>
        {mapUrl ? (
          <iframe
            title={title}
            className="w-full h-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={mapUrl}
          />
        ) : (
          <div className="w-full h-full bg-muted flex flex-col items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Map not available</p>
          </div>
        )}
      </div>

      {destination && (
        <p className="text-sm text-muted-foreground">
          📍 <span className="font-medium">{destination}</span>
          {latitude && longitude && ` (${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°)`}
        </p>
      )}
    </div>
  );
}
