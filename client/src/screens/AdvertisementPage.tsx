"use client";

import { ArrowRight, Megaphone, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AdvertisementForm } from '@/components/ui/advertisement-form';
import { Button } from '@/components/ui/button';

export default function AdvertisementPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.20),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.20),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.94))] px-4 py-8 dark:bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <section className="space-y-6 rounded-4xl border border-white/20 bg-white/80 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            <Sparkles className="h-3.5 w-3.5" />
            New Advertisement Request
          </div>

          <div className="space-y-3">
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Put your business in front of travelers.
            </h1>
            <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
              Submit one photo, your mobile number, and the right location from the existing database. Your request goes to admin review before it is published.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <Megaphone className="h-5 w-5 text-rose-500" />
              <p className="mt-3 text-sm font-semibold">One image</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Upload a single photo for your ad card.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <ShieldCheck className="h-5 w-5 text-orange-500" />
              <p className="mt-3 text-sm font-semibold">Admin approval</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">All public submissions wait for review.</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <ArrowRight className="h-5 w-5 text-amber-500" />
              <p className="mt-3 text-sm font-semibold">Location based</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">Country, state, and area from the database.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100">
            If you are an admin, open the dashboard to approve submissions or add a live advertisement directly.
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="gap-2 rounded-full">
              <Link href="/admin">
                Open Admin Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/">
                Back to Home
              </Link>
            </Button>
          </div>
        </section>

        <AdvertisementForm submitLabel="Submit for Approval" defaultStatus="pending" mode="public" />
      </div>
    </main>
  );
}