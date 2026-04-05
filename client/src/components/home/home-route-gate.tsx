"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LandingPage from '@/screens/LandingPage';
import { doc, getDoc } from 'firebase/firestore';
import { firestoreDb } from '@/lib/firebaseFirestore';

export default function HomeRouteGate() {
  const router = useRouter();
  const [loadingSetting, setLoadingSetting] = useState(true);
  const [homePageEnabled, setHomePageEnabled] = useState(true);

  const getHomeSettingFromClientFirestore = async () => {
    const settingsRef = doc(firestoreDb, 'admin_settings', 'system');
    const snapshot = await getDoc(settingsRef);
    const value = snapshot.exists() ? snapshot.data()?.homePageEnabled : true;
    return value !== false;
  };

  useEffect(() => {
    let isMounted = true;

    const loadHomePageSetting = async () => {
      try {
        const response = await fetch('/api/public/settings', {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        let enabledValue = payload?.success
          ? payload?.data?.homePageEnabled
          : undefined;

        // If server-side lookup falls back (e.g., missing admin credentials),
        // try direct client Firestore read as a secondary source.
        if (payload?.data?._fallback === true || enabledValue === undefined) {
          try {
            enabledValue = await getHomeSettingFromClientFirestore();
          } catch {
            enabledValue = true;
          }
        }

        if (!isMounted) {
          return;
        }

        setHomePageEnabled(enabledValue !== false);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load home page setting:', error);
        }
        if (isMounted) {
          setHomePageEnabled(true);
        }
      } finally {
        if (isMounted) {
          setLoadingSetting(false);
        }
      }
    };

    loadHomePageSetting();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loadingSetting && !homePageEnabled) {
      router.replace('/chat');
    }
  }, [homePageEnabled, loadingSetting, router]);

  if (loadingSetting || !homePageEnabled) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <LandingPage />;
}
