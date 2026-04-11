"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/mvpblocks/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { PageViewTracker } from "@/components/PageViewTracker";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Defensive cleanup for stale locks left by interrupted modal/checkout flows.
    html.classList.remove("payment-modal-open", "lenis-stopped");
    body.classList.remove("payment-modal-open");

    if (body.style.position === "fixed") {
      body.style.position = "";
    }

    if (body.style.top) {
      body.style.top = "";
    }

    if (body.style.width) {
      body.style.width = "";
    }

    if (body.style.touchAction === "none") {
      body.style.touchAction = "";
    }

    if (body.style.overflow === "hidden") {
      body.style.overflow = "";
    }
  }, [pathname]);

  useEffect(() => {
    const disableLenisOnRoute =
      pathname === "/trip-stories" ||
      pathname === "/travel-itinerary";

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches;
    const isSmallViewport = window.matchMedia("(max-width: 1024px)").matches;
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    const disableLenisOnMobile = isTouchDevice || (isSmallViewport && hasTouchPoints);

    // Touch devices generally feel smoother with native scrolling than JS-driven smoothing.
    if (disableLenisOnRoute || prefersReducedMotion || disableLenisOnMobile) {
      return;
    }

    const lenis = new Lenis({
      duration: 0.9,
      smoothWheel: true,
      syncTouch: true,
      prevent: (node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }

        return node.closest('[data-lenis-prevent]') !== null;
      },
    });

    let rafId = 0;

    const raf = (time: number) => {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    };

    rafId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { code?: string; message?: string } | undefined;
      const code = typeof reason?.code === "string" ? reason.code : "";
      const message = typeof reason?.message === "string" ? reason.message : "";

      const isTransientFirebaseNetworkError =
        code === "auth/network-request-failed" ||
        code === "unavailable" ||
        message.includes("network-request-failed") ||
        message.includes("didn't respond within 10 seconds");

      if (!isTransientFirebaseNetworkError) return;

      // Prevent noisy red unhandled rejection logs for transient offline periods.
      event.preventDefault();
      if (process.env.NODE_ENV === "development") {
        console.warn("Transient Firebase network issue detected. App will retry automatically.");
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <PageViewTracker />
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
