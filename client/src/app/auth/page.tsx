"use client";

import { Suspense } from "react";
import AuthPage from "@/screens/AuthPage";

export default function AuthRoute() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <AuthPage />
    </Suspense>
  );
}

