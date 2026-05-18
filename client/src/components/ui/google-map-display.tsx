'use client';

import React, { useMemo } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';

interface GoogleMapDisplayProps {
  latitude?: number;
  longitude?: number;
  destination?: string;
  googleMapsUrl?: string;
  zoom?: number;
  height?: string;
  className?: string;
  title?: string;
  showMarker?: boolean;
}

export function buildGoogleMapsEmbedUrl({
  latitude,
  longitude,
  destination,
  googleMapsUrl,
  zoom = 12,
}: {
  latitude?: number;
  longitude?: number;
  destination?: string;
  googleMapsUrl?: string;
  zoom?: number;
}): string | null {
  const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';

  if (hasCoordinates) {
    return `https://www.google.com/maps?q=${latitude},${longitude}&z=${zoom}&output=embed`;
  }

  const rawMapUrl = String(googleMapsUrl || '').trim();
  if (rawMapUrl) {
    const withProtocol = /^https?:\/\//i.test(rawMapUrl) ? rawMapUrl : `https://${rawMapUrl}`;

    try {
      const url = new URL(withProtocol);
      const host = url.hostname.toLowerCase();
      let query = '';

      if (url.pathname.includes('/maps/embed')) {
        return url.toString();
      }

      if (host.includes('google.') || host.includes('goo.gl') || host.includes('maps.app.goo.gl')) {
        query = decodeURIComponent(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();

        if (!query) {
          const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
          if (placeMatch?.[1]) {
            query = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim();
          }
        }

        if (!query) {
          const coordsMatch = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
          if (coordsMatch) {
            query = `${coordsMatch[1]},${coordsMatch[2]}`;
          }
        }
      }

      return `https://www.google.com/maps?q=${encodeURIComponent(query || rawMapUrl)}&z=${zoom}&output=embed`;
    } catch {
      return `https://www.google.com/maps?q=${encodeURIComponent(rawMapUrl)}&z=${zoom}&output=embed`;
    }
  }

  const query = String(destination || '').trim();
  if (!query) return null;

  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
}

/**
 * Reusable Google Maps Component
 * Displays an embedded Google Map with location marker.
 * Uses iframe embeds, so no API key is required for this preview.
 */
export default function GoogleMapDisplay({
  latitude,
  longitude,
  destination = 'Paris',
  googleMapsUrl,
  zoom = 12,
  height = 'h-96',
  className = '',
  title = 'Location',
}: GoogleMapDisplayProps) {
  const mapUrl = useMemo(() => {
    return buildGoogleMapsEmbedUrl({ latitude, longitude, destination, googleMapsUrl, zoom });
  }, [latitude, longitude, destination, googleMapsUrl, zoom]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {title && (
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-rose-500" />
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
      )}

      <div className={`relative overflow-hidden rounded-xl border border-border shadow-sm ${height}`}>
        {mapUrl ? (
          <iframe
            title={title}
            className="h-full w-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={mapUrl}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Map not available</p>
          </div>
        )}
      </div>

      {destination && (
        <p className="text-sm text-muted-foreground">
          <MapPin className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
          <span className="font-medium">{destination}</span>
          {typeof latitude === 'number' && typeof longitude === 'number' && ` (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`}
        </p>
      )}
    </div>
  );
}
