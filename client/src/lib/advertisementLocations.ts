export type AdvertisementLocationOption = {
  country: string;
  state: string;
  area: string;
};

export type AdvertisementLocationResponse = {
  locations: AdvertisementLocationOption[];
  source: 'cache' | 'firestore';
};

export async function fetchAdvertisementLocations(): Promise<AdvertisementLocationResponse> {
  const response = await fetch('/api/advertisement-locations', {
    method: 'GET',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Failed to load advertisement locations');
  }

  return payload.data as AdvertisementLocationResponse;
}