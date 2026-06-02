export type TouristPlaceMediaLike = {
  coverImage?: unknown;
  media?: unknown;
  photos?: unknown;
  videos?: unknown;
  mediaCount?: unknown;
};

const asLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

export function getTouristPlacePhotoCount(place: TouristPlaceMediaLike): number {
  const indexedMediaCount = typeof place.mediaCount === 'number' ? place.mediaCount : Number(place.mediaCount || 0);
  if (indexedMediaCount > 0) {
    return indexedMediaCount;
  }

  const coverImageCount = String(place.coverImage || '').trim() ? 1 : 0;
  const mediaArrayCount = asLength(place.media);
  const photosCount = asLength(place.photos);
  const videosCount = asLength(place.videos);

  return coverImageCount + mediaArrayCount + photosCount + videosCount;
}

export function hasTouristPlacePhotos(place: TouristPlaceMediaLike): boolean {
  return getTouristPlacePhotoCount(place) > 0;
}