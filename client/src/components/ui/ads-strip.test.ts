import { describe, it, expect } from 'vitest';
import { getAdMatchScore } from './ads-strip';
import type { TouristPlace } from './tourist-places';

describe('AdsStrip Relevance and Location Matching tests', () => {
  // Mock AdItem type structure locally for testing helper
  type TestAdItem = Parameters<typeof getAdMatchScore>[0];

  const mockAds: TestAdItem[] = [
    {
      id: 'ad_india_sikkim_darjeeling',
      name: 'Darjeeling Adventure Guide',
      country: 'India, United States, Australia',
      state: 'West Bengal, Sikkim',
      area: 'Darjeeling',
      category: 'Travel Guide',
      description: 'The best adventure guide for Darjeeling and Sikkim area.',
      rating: 4,
    },
    {
      id: 'ad_us_only',
      name: 'Grand Canyon Tours',
      country: 'United States',
      state: 'Arizona',
      area: 'Grand Canyon',
      category: 'Travel services',
      description: 'Exclusive Grand Canyon tours and travel services.',
      rating: 5,
    },
    {
      id: 'ad_india_general_low_rating',
      name: 'India Hotels General Low',
      country: 'India',
      state: 'West Bengal',
      area: 'Kolkata',
      category: 'Hostel / Hotel / Homestay',
      description: 'Budget homestay choices.',
      rating: 3,
    },
    {
      id: 'ad_india_general_high_rating',
      name: 'India Hotels General High',
      country: 'India',
      state: 'West Bengal',
      area: 'Kolkata',
      category: 'Hostel / Hotel / Homestay',
      description: 'Premium hotels and homestay bookings all over India.',
      rating: 5,
    },
  ];

  it('should match place in United States (Grand Canyon) when United States is selected in country list', () => {
    const places: TouristPlace[] = [
      {
        id: 'place_grand_canyon',
        name: 'Grand Canyon National Park',
        area: 'Grand Canyon',
        city: 'Grand Canyon',
        state: 'Arizona',
        country: 'United States',
        description: 'Iconic canyon carved by the Colorado River.',
        category: 'Other',
        googleMapsUrl: '',
        coverImage: '',
        media: [],
        extraInfo: [],
      },
    ];

    // Grand Canyon ad has country 'United States'. It should match.
    const usAdResult = getAdMatchScore(mockAds[1], 'Grand Canyon', places);
    expect(usAdResult.matched).toBe(true);
    expect(usAdResult.score).toBeGreaterThan(0);

    // Darjeeling ad targets 'India, United States, Australia'. It should also match because country matches 'United States'.
    const multiCountryAdResult = getAdMatchScore(mockAds[0], 'Grand Canyon', places);
    expect(multiCountryAdResult.matched).toBe(true);
    expect(multiCountryAdResult.score).toBeGreaterThan(0);

    // India only ad should NOT match Grand Canyon
    const indiaAdResult = getAdMatchScore(mockAds[2], 'Grand Canyon', places);
    expect(indiaAdResult.matched).toBe(false);
  });

  it('should match multiple targeted states and areas correctly', () => {
    const places: TouristPlace[] = [
      {
        id: 'place_gangtok',
        name: 'Gangtok Cable Car',
        area: 'Gangtok',
        city: 'Gangtok',
        state: 'Sikkim',
        country: 'India',
        description: 'Beautiful scenic views.',
        category: 'Other',
        googleMapsUrl: '',
        coverImage: '',
        media: [],
        extraInfo: [],
      },
    ];

    // ad_india_sikkim_darjeeling has state 'West Bengal, Sikkim'. It should match place in Sikkim.
    const result = getAdMatchScore(mockAds[0], 'Gangtok', places);
    expect(result.matched).toBe(true);
    // Since state matches (Sikkim) but area does not, score should be state level
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('should calculate higher relevance score for specific area matches than country-only matches', () => {
    const places: TouristPlace[] = [
      {
        id: 'place_darjeeling_tea_garden',
        name: 'Happy Valley Tea Estate',
        area: 'Darjeeling',
        city: 'Darjeeling',
        state: 'West Bengal',
        country: 'India',
        description: 'Tea estate in Darjeeling.',
        category: 'Other',
        googleMapsUrl: '',
        coverImage: '',
        media: [],
        extraInfo: [],
      },
    ];

    // Darjeeling ad specifically targets 'Darjeeling' area.
    const darjeelingAdResult = getAdMatchScore(mockAds[0], 'Darjeeling', places);
    
    // India general ad targets 'India' but area is 'Kolkata'.
    const indiaAdResult = getAdMatchScore(mockAds[2], 'Darjeeling', places);

    expect(darjeelingAdResult.matched).toBe(true);
    expect(indiaAdResult.matched).toBe(true); // Matches on country 'India'
    expect(darjeelingAdResult.score).toBeGreaterThan(indiaAdResult.score); // Specific area match should have higher score
  });

  it('should sort ads correctly: relevance score first, then rating, and then newest', () => {
    const places: TouristPlace[] = [
      {
        id: 'place_kolkata_victoria',
        name: 'Victoria Memorial',
        area: 'Kolkata',
        city: 'Kolkata',
        state: 'West Bengal',
        country: 'India',
        description: 'Historic monument in Kolkata.',
        category: 'Other',
        googleMapsUrl: '',
        coverImage: '',
        media: [],
        extraInfo: [],
      },
    ];

    // We have three ads that will match:
    // 1. ad_india_sikkim_darjeeling (matches Country=India, State=West Bengal. Score = 3)
    // 2. ad_india_general_low_rating (matches Area=Kolkata. Score = 5, Rating = 3)
    // 3. ad_india_general_high_rating (matches Area=Kolkata. Score = 5, Rating = 5)

    const scoredAds = mockAds.map(ad => {
      const { matched, score } = getAdMatchScore(ad, 'Kolkata', places);
      return { ...ad, score, matched };
    }).filter(ad => ad.matched);

    // Sort using our sorting logic
    scoredAds.sort((left, right) => {
      const scoreDiff = (right.score || 0) - (left.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const ratingDiff = (right.rating || 0) - (left.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;

      return 0; // timestamp tie breaker not tested here
    });

    // Expecting:
    // First: ad_india_general_high_rating (Score 5, Rating 5)
    // Second: ad_india_general_low_rating (Score 5, Rating 3)
    // Third: ad_india_sikkim_darjeeling (Score 3, Rating 4)
    expect(scoredAds[0].id).toBe('ad_india_general_high_rating');
    expect(scoredAds[1].id).toBe('ad_india_general_low_rating');
    expect(scoredAds[2].id).toBe('ad_india_sikkim_darjeeling');
  });
});
