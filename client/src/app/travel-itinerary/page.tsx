"use client";

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TravelItenaryDisplay from "../../screens/TravelItenaryDisplay";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionInfo, hasPaidAccess } from '@/lib/subscriptionPolicy';

export default function TravelItineraryRoute() {
  const router = useRouter();
  const { userProfile, loading } = useAuth();
  const subscriptionInfo = useMemo(() => getSubscriptionInfo(userProfile), [userProfile]);
  const paidMember = useMemo(() => hasPaidAccess(subscriptionInfo), [subscriptionInfo]);

  if (!loading && paidMember) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-linear-to-br from-rose-100 to-gray-200">
        <div className="max-w-xl w-full rounded-2xl border border-border bg-background p-8 text-center shadow-lg">
          <h1 className="text-2xl font-bold text-foreground mb-3">Travel Itinerary Access Restricted</h1>
          <p className="text-muted-foreground mb-6">
            Paid members cannot access the Travel Itinerary page under the current policy.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => router.push('/chat')} className="w-full sm:w-auto">Go to Community</Button>
            <Button onClick={() => router.push('/trip-stories')} variant="outline" className="w-full sm:w-auto">View Trip Stories</Button>
          </div>
        </div>
      </div>
    );
  }

  return <TravelItenaryDisplay />;
}
