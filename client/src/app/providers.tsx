"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "@/components/mvpblocks/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ModernDialogHost } from "@/components/ui/modern-dialog-host";
import { ProfileCompletionCheck } from "@/components/ProfileCompletionCheck";
import { modernAlert } from "@/lib/modernDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const isTouchDevice =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches;

    if (!isTouchDevice) {
      return;
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    const onGestureStart = (event: Event) => {
      event.preventDefault();
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("gesturestart", onGestureStart, { passive: false } as AddEventListenerOptions);

    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("gesturestart", onGestureStart as EventListener);
    };
  }, []);

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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches;
    const isSmallViewport = window.matchMedia("(max-width: 1024px)").matches;
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    const disableLenisOnMobile =
      isSmallViewport ||
      isTouchDevice ||
      (isSmallViewport && hasTouchPoints);

    // Mobile/touch devices generally feel smoother with native scrolling.
    if (prefersReducedMotion || disableLenisOnMobile) {
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
    const nativeAlert = window.alert.bind(window);

    window.alert = (message?: unknown) => {
      void modernAlert(typeof message === "string" ? message : String(message ?? ""));
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

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

  useEffect(() => {
    const isSupportedInputType = (type: string) => {
      const normalized = (type || "text").toLowerCase();
      const blocked = new Set([
        "button",
        "submit",
        "reset",
        "checkbox",
        "radio",
        "file",
        "range",
        "color",
      ]);

      return !blocked.has(normalized);
    };

    const onGlobalEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (event.defaultPrevented) return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-enter-ignore='true']")) return;
      if (target.closest("[role='combobox'], [role='listbox'], [role='menu'], [role='dialog']")) return;

      const tagName = target.tagName.toLowerCase();
      if (tagName === "textarea") return;
      if (target.isContentEditable) return;

      if (target instanceof HTMLInputElement && !isSupportedInputType(target.type)) {
        return;
      }

      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }

      const form = target.closest("form");
      if (!form || !(form instanceof HTMLFormElement)) return;

      event.preventDefault();
      form.requestSubmit();
    };

    window.addEventListener("keydown", onGlobalEnter);
    return () => window.removeEventListener("keydown", onGlobalEnter);
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <PageViewTracker />
        <ProfileCompletionCheck />
        {children}
        <ModernDialogHost />
      </AuthProvider>
    </ThemeProvider>
  );
}
