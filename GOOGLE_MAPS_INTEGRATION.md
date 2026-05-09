# Google Maps Integration Guide

## Overview

Google Maps has been successfully integrated into your ABJEE Travel application with the following features:

1. **Client-Side Map Display** - "Explore Your Interests" section on landing page
2. **Admin Dashboard Maps** - New "Explore Maps" tab showing destination locations
3. **Embedded Map Component** - Reusable GoogleMapDisplay component for any location

## Components Created

### 1. GoogleMapDisplay Component
**File:** `src/components/ui/google-map-display.tsx`

A reusable component for displaying embedded Google Maps with location markers.

```typescript
<GoogleMapDisplay
  latitude={48.8566}
  longitude={2.3522}
  destination="Paris, France"
  title="Location on Map"
  zoom={12}
  height="h-96"
/>
```

**Props:**
- `latitude` (number) - Map center latitude
- `longitude` (number) - Map center longitude
- `destination` (string) - Location name
- `zoom` (number) - Map zoom level (default: 12)
- `height` (string) - Tailwind height class (default: h-96)
- `title` (string) - Section title
- `showMarker` (boolean) - Show location marker (default: true)
- `className` (string) - Additional CSS classes

### 2. ExploreInterests Component
**File:** `src/components/ui/explore-interests.tsx`

Interactive carousel displaying travel destinations with embedded Google Maps.

**Features:**
- Multiple destination showcase
- Interactive map navigation
- Best time to visit information
- Star ratings
- Previous/Next navigation
- Destination carousel buttons

**Default Destinations:**
- Paris, France
- Tokyo, Japan
- Bali, Indonesia
- New York, USA
- Dubai, UAE
- Istanbul, Turkey

## Integration Points

### Landing Page
**File:** `src/screens/LandingPage.tsx`

The ExploreInterests component is displayed between the FeatureBlock3 and FAQ sections.

```typescript
<FeatureBlock3/>
<ExploreInterests />
<Faq3/>
```

### Admin Dashboard
**File:** `src/components/mvpblocks/index.tsx`

New "Explore Maps" tab added to admin dashboard menu with the following:
- Displays all destination maps
- Full navigation between locations
- Shows coordinates and location details

## How It Works

### Embedded Maps (No API Key Required)

The implementation uses Google Maps embedded iframe, which doesn't require an API key for basic embedding:

```typescript
// Map URL format for embedded maps
https://www.google.com/maps/embed?pb=[encoded_parameters]
```

This approach is used because:
- ✅ No API key required
- ✅ No billing concerns
- ✅ Simple implementation
- ✅ Works for display purposes
- ✅ Respects usage limits

### Adding a Google Maps API Key (Optional)

If you want to use advanced features (custom styling, markers, search, etc.), you can:

1. **Enable Google Maps API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create/select your project
   - Enable "Maps JavaScript API"
   - Create an API key
   - Add restrictions (HTTP referrers)

2. **Add to Environment:**
   ```env
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

3. **Update .env file:**
   ```bash
   cd client
   # Edit .env and add the key
   ```

4. **Use in Components:**
   ```typescript
   const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
   ```

## Using the Components

### Basic Map Display
```typescript
import GoogleMapDisplay from '@/components/ui/google-map-display';

export default function MyComponent() {
  return (
    <GoogleMapDisplay
      latitude={35.6762}
      longitude={139.6503}
      destination="Tokyo, Japan"
      title="Tokyo Location"
    />
  );
}
```

### Full Explore Section
```typescript
import ExploreInterests from '@/components/ui/explore-interests';

export default function HomePage() {
  const customDestinations = [
    {
      id: 'rome',
      name: 'Rome, Italy',
      description: 'Ancient history and artistic heritage',
      latitude: 41.9028,
      longitude: 12.4964,
      bestTime: 'April-May, September-October',
      rating: 4.8,
    },
    // ... more destinations
  ];

  return <ExploreInterests interests={customDestinations} />;
}
```

## Customization

### Adding New Destinations

Edit `src/components/ui/explore-interests.tsx`:

```typescript
const DEFAULT_INTERESTS: InterestDestination[] = [
  {
    id: 'rome',
    name: 'Rome, Italy',
    description: 'Ancient history and artistic heritage',
    latitude: 41.9028,
    longitude: 12.4964,
    bestTime: 'April-May, September-October',
    rating: 4.8,
  },
  // Add more here
];
```

### Styling

Both components use Tailwind CSS with dark mode support:
- Maps container: `rounded-xl border border-border shadow-sm`
- Cards: `from-rose-500 to-orange-500` gradient theme
- Responsive: Works on mobile, tablet, and desktop

## Environment Variables

No additional environment variables are required for basic functionality. The embedded maps work without API keys.

**Optional for advanced features:**
```env
# Google Maps API (optional - for advanced features only)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

## Browser Compatibility

The embedded Google Maps work on all modern browsers:
- Chrome/Edge
- Firefox
- Safari
- Mobile browsers

## Performance

- Lazy loading via dynamic imports
- Suspense fallback for loading states
- Iframe-based maps don't impact load time
- CSS animations with Framer Motion

## Troubleshooting

### Maps Not Showing

1. **Check iframe loading:**
   - Open DevTools Console
   - Check for CSP (Content Security Policy) errors
   - Verify iframe src URL is valid

2. **Check location parameters:**
   - Ensure latitude/longitude are numbers
   - Verify coordinates are valid (lat: -90 to 90, lng: -180 to 180)

3. **Check browser console:**
   - Look for CORS errors
   - Check network tab for iframe requests

### Slow Performance

1. Use `lazy()` and `Suspense` for components
2. Only render maps when needed
3. Cache destination data server-side

## Files Modified/Created

```
✅ src/components/ui/google-map-display.tsx       [NEW]
✅ src/components/ui/explore-interests.tsx        [NEW]
✅ src/screens/LandingPage.tsx                     [UPDATED]
✅ src/components/mvpblocks/index.tsx              [UPDATED]
```

## Next Steps

1. **Test the integration:**
   ```bash
   cd client
   npm run dev
   # Visit http://localhost:3000
   # Check landing page "Explore Your Interests"
   # Check admin dashboard "Explore Maps" tab
   ```

2. **Customize destinations:**
   - Edit destination list in explore-interests.tsx
   - Add coordinates for your target locations
   - Update descriptions and ratings

3. **Add API key (optional):**
   - Only if you need advanced features
   - Follow the "Adding a Google Maps API Key" section above

4. **Deploy:**
   - Maps work on all deployment platforms
   - No special configuration needed
   - Embedded iframe is compatible with Vercel, Netlify, etc.

## Support

For issues or questions:
- Check browser DevTools console for errors
- Verify component imports are correct
- Ensure destination data format matches the interface
- Review the component prop definitions

---

**Last Updated:** May 2026
**Status:** ✅ Active and Ready for Use
