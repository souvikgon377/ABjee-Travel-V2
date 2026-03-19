import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ABjee Travel",
  description: "Your ultimate travel companion",
  manifest: "/manifest.json",
  icons: { icon: "/logo.jpg", apple: "/logo.jpg" },
};

export const viewport = {
  themeColor: "#f43f5e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
