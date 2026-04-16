"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function TourPlacesRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/tourplaces?${query}` : '/tourplaces');
  }, [router, searchParams]);

  return null;
}
