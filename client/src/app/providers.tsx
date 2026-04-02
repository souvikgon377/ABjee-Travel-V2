"use client";

import { useEffect } from "react";
import { ThemeProvider } from "@/components/mvpblocks/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { PageViewTracker } from "@/components/PageViewTracker";

export function Providers({ children }: { children: React.ReactNode }) {
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
