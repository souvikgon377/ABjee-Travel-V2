"use client";

import { useEffect } from "react";

export default function NotFound() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentUrl = window.location.href;
    const referrer = document.referrer;
    const isSameOriginReferrer = referrer.startsWith(window.location.origin);

    if (isSameOriginReferrer && referrer !== currentUrl) {
      // Force a full reload of the previous page to avoid stale client state.
      window.location.replace(referrer);
      return;
    }

    if (window.history.length > 1) {
      window.history.back();

      // If back navigation fails or lands on another invalid state, go home.
      const fallbackTimer = window.setTimeout(() => {
        window.location.replace("/");
      }, 700);

      return () => window.clearTimeout(fallbackTimer);
    }

    window.location.replace("/");
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-white text-slate-700">
      <p className="text-sm">Redirecting...</p>
    </div>
  );
}
