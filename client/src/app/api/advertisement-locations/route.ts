import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getSharedPlacesCache } from '@/lib/server/sharedPlacesCache';
import client, { TYPESENSE_ENABLED } from '@/modules/search/typesenseClient';

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
    // Use area if available, otherwise fall back to state (some countries only have country+state)
    const area = normalize(row.area) || state;

    if (!country || !state) continue;

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
    // 1. Try Typesense if enabled — fetch all pages in parallel (2140+ docs)
    if (TYPESENSE_ENABLED) {
      try {
        const pageSize = 250;

        // Fetch page 1 first to learn the total count
        const firstPage = await client.collections('tourist_places').documents().search({
          q: '*',
          query_by: 'name',
          filter_by: 'isActive:=true',
          per_page: pageSize,
          page: 1,
          include_fields: 'country,state,city,area',
        });

        const totalFound: number = (firstPage as any).found ?? 0;
        const totalPages = Math.ceil(totalFound / pageSize);

        // Fetch remaining pages in parallel
        const remainingPages = totalPages > 1
          ? await Promise.all(
              Array.from({ length: totalPages - 1 }, (_, i) =>
                client.collections('tourist_places').documents().search({
                  q: '*',
                  query_by: 'name',
                  filter_by: 'isActive:=true',
                  per_page: pageSize,
                  page: i + 2,
                  include_fields: 'country,state,city,area',
                })
              )
            )
          : [];

        const allHits = [
          ...(firstPage.hits || []),
          ...remainingPages.flatMap((r) => r.hits || []),
        ] as any[];

        const tsRows: LocationRow[] = allHits.map((hit) => ({
          country: hit.document.country || '',
          state: hit.document.state || '',
          area: hit.document.area || hit.document.city || '',
        }));

        const typesenseLocations = buildLocations(tsRows);
        if (typesenseLocations.length > 0) {
          return NextResponse.json({
            success: true,
            data: {
              locations: typesenseLocations,
              source: 'typesense' as const,
            },
          });
        }
      } catch (tsError) {
        console.warn('[advertisement-locations] Typesense query failed, falling back:', tsError);
      }
    }

    // 2. Fall back to sharedPlacesCache
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

    // 3. Fall back to Firestore (limit 500)
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