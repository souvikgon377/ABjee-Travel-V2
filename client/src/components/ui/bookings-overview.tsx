import { memo, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCcw, Hotel, Car, Bike, ArrowRight, CalendarDays } from 'lucide-react';
import { collection, doc, getCountFromServer, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { useRouter } from 'next/navigation';

type BookingStats = {
  total: number;
  hotel: number;
  cab: number;
  bike: number;
};

const EMPTY_STATS: BookingStats = {
  total: 0,
  hotel: 0,
  cab: 0,
  bike: 0,
};

export const BookingsOverview = memo(() => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryToggleLoading, setCategoryToggleLoading] = useState(false);
  const [bookingCategoriesEnabled, setBookingCategoriesEnabled] = useState(true);
  const [stats, setStats] = useState<BookingStats>(EMPTY_STATS);

  const fetchStats = useCallback(async () => {
    const [bookings, hotelBookings, cabBookings, bikeBookings] = await Promise.allSettled([
      getCountFromServer(collection(firestoreDb, 'bookings')),
      getCountFromServer(collection(firestoreDb, 'hotelBookings')),
      getCountFromServer(collection(firestoreDb, 'cabBookings')),
      getCountFromServer(collection(firestoreDb, 'bikeBookings')),
    ]);

    const hotelCount = hotelBookings.status === 'fulfilled' ? hotelBookings.value.data().count : 0;
    const cabCount = cabBookings.status === 'fulfilled' ? cabBookings.value.data().count : 0;
    const bikeCount = bikeBookings.status === 'fulfilled' ? bikeBookings.value.data().count : 0;

    const baseTotal = bookings.status === 'fulfilled' ? bookings.value.data().count : 0;
    const total = Math.max(baseTotal, hotelCount + cabCount + bikeCount);

    setStats({
      total,
      hotel: hotelCount,
      cab: cabCount,
      bike: bikeCount,
    });
  }, []);

  const fetchBookingCategoriesSetting = useCallback(async () => {
    try {
      const settingsRef = doc(firestoreDb, 'admin_settings', 'system');
      const snapshot = await getDoc(settingsRef);
      const enabledValue = snapshot.exists() ? snapshot.data()?.bookingCategoriesEnabled : true;
      setBookingCategoriesEnabled(enabledValue !== false);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load booking categories setting:', error);
      }
      setBookingCategoriesEnabled(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchStats(), fetchBookingCategoriesSetting()]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [fetchBookingCategoriesSetting, fetchStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchBookingCategoriesSetting()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchBookingCategoriesSetting, fetchStats]);

  const handleToggleBookingCategories = useCallback(async () => {
    setCategoryToggleLoading(true);
    const nextValue = !bookingCategoriesEnabled;

    try {
      const settingsRef = doc(firestoreDb, 'admin_settings', 'system');
      await setDoc(
        settingsRef,
        {
          bookingCategoriesEnabled: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setBookingCategoriesEnabled(nextValue);
    } catch (error) {
      console.error('Failed to update booking categories status:', error);
      alert('Unable to update booking categories status. Please try again.');
    } finally {
      setCategoryToggleLoading(false);
    }
  }, [bookingCategoriesEnabled]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Bookings Overview</h2>
          <p className="text-sm text-muted-foreground">Track booking volumes and jump to booking pages.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCcw className={`mr-2 h-4 w-4 ${(refreshing || loading) ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Bookings</CardDescription>
            <CardTitle className="text-2xl">{stats.total.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary" className="gap-1">
              <CalendarDays className="h-3 w-3" />
              All channels
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hotel Bookings</CardDescription>
            <CardTitle className="text-2xl">{stats.hotel.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Hotel className="h-4 w-4 text-blue-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cab Bookings</CardDescription>
            <CardTitle className="text-2xl">{stats.cab.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Car className="h-4 w-4 text-green-500" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bike Bookings</CardDescription>
            <CardTitle className="text-2xl">{stats.bike.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Bike className="h-4 w-4 text-orange-500" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <motion.div
          whileHover={{ y: -2 }}
          className="rounded-xl border border-border bg-card/50 p-4 text-left transition-colors hover:border-primary/40"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Booking Categories</h3>
                <p className="mt-1 text-sm text-muted-foreground">Manage tour and package category pages.</p>
              </div>
              <Badge variant={bookingCategoriesEnabled ? 'secondary' : 'destructive'}>
                {bookingCategoriesEnabled ? 'Live' : 'Off'}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/booking-categories')}
                disabled={!bookingCategoriesEnabled}
              >
                Open
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={bookingCategoriesEnabled ? 'destructive' : 'default'}
                onClick={handleToggleBookingCategories}
                disabled={categoryToggleLoading}
              >
                {categoryToggleLoading
                  ? 'Saving...'
                  : bookingCategoriesEnabled
                    ? 'Turn Off'
                    : 'Turn On'}
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={() => router.push('/hotel-list')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-border bg-card/50 p-4 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Open Hotel Listing</h3>
              <p className="mt-1 text-sm text-muted-foreground">Review hotel inventory and booking journeys.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </motion.button>

        <motion.button
          type="button"
          onClick={() => router.push('/cab-booking')}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-border bg-card/50 p-4 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Open Cab Booking</h3>
              <p className="mt-1 text-sm text-muted-foreground">Check current cab booking flows and forms.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </motion.button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading booking stats...</p> : null}
    </div>
  );
});

BookingsOverview.displayName = 'BookingsOverview';
