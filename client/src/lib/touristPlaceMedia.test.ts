import { describe, expect, it } from 'vitest';
import { getTouristPlacePhotoCount, hasTouristPlacePhotos } from './touristPlaceMedia';

describe('touristPlaceMedia helpers', () => {
  it('counts coverImage, media, photos, and videos as photo-bearing content', () => {
    expect(getTouristPlacePhotoCount({ coverImage: 'https://img.test/a.jpg' })).toBe(1);
    expect(getTouristPlacePhotoCount({ media: [{}, {}] })).toBe(2);
    expect(getTouristPlacePhotoCount({ photos: [{}, {}], videos: [{}] })).toBe(3);
    expect(hasTouristPlacePhotos({ coverImage: 'https://img.test/a.jpg' })).toBe(true);
    expect(hasTouristPlacePhotos({ media: [] , photos: [], videos: [] })).toBe(false);
  });
});