"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TourPlacesRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/tourplaces');
  }, [router]);

  return null;
}
