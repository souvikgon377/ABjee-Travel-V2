import { Metadata } from 'next';
import AdminTravelItenary from '@/components/ui/travel-itenary';

export const metadata: Metadata = {
  title: 'Travel Admin | AbJee Travel',
  description: 'Manage and upload travel destination data',
};

export default function AdminTravelPage() {
  return <AdminTravelItenary />;
}
