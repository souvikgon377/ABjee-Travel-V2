"use client";

import { ThemeProvider } from "@/components/mvpblocks/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
