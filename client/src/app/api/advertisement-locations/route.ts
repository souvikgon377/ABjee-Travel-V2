import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getSharedPlacesCache } from '@/lib/server/sharedPlacesCache';

type LocationRow = {
  country: string;
  state: string;
  area: string;
};

const normalize = (value: unknown) => String(value ?? '').trim();

const buildLocations = (rows: LocationRow[]) => {
  const deduped = new Map<string, LocationRow>();

  for (const row of rows) {
    const country = normalize(row.country);
    const state = normalize(row.state);
    const area = normalize(row.area);

    if (!country || !state || !area) continue;

    const key = `${country.toLowerCase()}|${state.toLowerCase()}|${area.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, { country, state, area });
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const countryCompare = left.country.localeCompare(right.country);
    if (countryCompare !== 0) return countryCompare;
    const stateCompare = left.state.localeCompare(right.state);
    if (stateCompare !== 0) return stateCompare;
    return left.area.localeCompare(right.area);
  });
};

export async function GET() {
  try {
    const cached = await getSharedPlacesCache();
    const cacheRows = buildLocations(
      (cached.places || []).map((place) => ({
        country: place.country,
        state: place.state,
        area: place.area || place.city,
      }))
    );

    if (cacheRows.length > 0) {
      return NextResponse.json({
        success: true,
        data: {
          locations: cacheRows,
          source: 'cache' as const,
        },
      });
    }

    const snapshot = await adminDb.collection('touristPlaces').limit(500).get();
    const firestoreRows = buildLocations(
      snapshot.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          country: normalize(data.country || 'India'),
          state: normalize(data.state || data.province),
          area: normalize(data.area || data.city || data.region),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        locations: firestoreRows,
        source: 'firestore' as const,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Registration locations';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}