"use client";

import dynamic from "next/dynamic";

const LandingPage = dynamic(() => import("@/screens/LandingPage"), {
  ssr: false,
});

export default function RootPage() {
  return <LandingPage />;
}

