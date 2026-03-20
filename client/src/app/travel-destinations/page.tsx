import { Metadata } from 'next';
import TravelItenaryDisplay from '../../screens/TravelItenaryDisplay';

export const metadata: Metadata = {
  title: 'Travel Destinations | AbJee Travel',
  description: 'Search and explore travel destinations with curated travel information',
};

export default function TravelDisplayPage() {
  return <TravelItenaryDisplay />;
}
