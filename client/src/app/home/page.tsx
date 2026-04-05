"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HomePage from "@/screens/HomePage";

export default function HomeRoute() {
  const router = useRouter();
  const [loadingSetting, setLoadingSetting] = useState(true);
  const [homePageEnabled, setHomePageEnabled] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadHomePageSetting = async () => {
      try {
        const response = await fetch('/api/public/settings', {
          method: 'GET',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        const enabledValue = payload?.success
          ? payload?.data?.homePageEnabled
          : true;

        if (!isMounted) {
          return;
        }

        setHomePageEnabled(enabledValue !== false);
      } catch {
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
    return null;
  }

  return <HomePage />;
}

