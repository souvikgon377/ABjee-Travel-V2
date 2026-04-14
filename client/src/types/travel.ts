/**
 * 🌍 TRAVEL DATA TYPES & SCHEMA
 * Defines the structure for travel content management system
 */

export interface TravelData {
  id: string;
  place: string;
  country: string;
  introduction?: string;
  itinerary: string;
  places: string[];
  restaurants: string[];
  hotels: string[];
  budget: string;
  images: string[];
  videos: string[];
  map: string | null;
  createdAt: string;
  updatedAt: string;
  overview?: string;
  durationText?: string;
  budgetEstimate?: string;
  travelTips?: string[];
  localInsights?: string[];
  routeFlow?: string;
  routePoints?: Array<{
    name: string;
    lat?: number;
    lng?: number;
  }>;
  generatedBy?: 'gemini' | 'system';
}

export interface TravelDataFormInput {
  place: string;
  country: string;
  itinerary: string;
  places: string[];
  restaurants: string[];
  hotels: string[];
  budget: string;
  imageFiles: File[];
  videoFiles: File[];
  mapFile: File | null;
}

export interface UploadedMedia {
  url: string;
  publicId: string;
  type: 'image' | 'video' | 'map';
  uploadedAt: string;
}

export interface TravelSearchResult {
  results: TravelData[];
  total: number;
  query: string;
}
