"use client";

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, Clock3, Eye, EyeOff, Lock, Mail, Megaphone, Search, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AdvertisementForm } from '@/components/ui/advertisement-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreDb } from '@/lib/firebaseFirestore';

type OwnerAdvertisement = {
  id: string;
  name: string;
  mobileNumber: string;
  country: string;
  state: string;
  area: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
  ownerUid?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhoneNumber?: string | null;
};

const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export default function AdvertisementPage() {
  const { currentUser, userProfile, loading, login, signup, changePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [ownerAds, setOwnerAds] = useState<OwnerAdvertisement[]>([]);
  const [ownerAdsLoading, setOwnerAdsLoading] = useState(false);
  const [ownerAdsError, setOwnerAdsError] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');

  const profileEmail = useMemo(() => currentUser?.email || userProfile?.email || '', [currentUser?.email, userProfile?.email]);
  const hasPasswordProvider = useMemo(
    () => currentUser?.providerData?.some((provider: any) => provider.providerId === 'password') ?? false,
    [currentUser]
  );
  const requiresPasswordSetup = Boolean(currentUser && !hasPasswordProvider);
  useEffect(() => {
    if (profileEmail) {
      setEmail(profileEmail);
    }
  }, [profileEmail]);

  useEffect(() => {
    if (!accessGranted || !currentUser) return;

    let mounted = true;

    const loadOwnerAds = async () => {
      setOwnerAdsLoading(true);
      setOwnerAdsError('');

      try {
        const snapshot = await getDocs(query(collection(firestoreDb, 'advertisements'), orderBy('createdAt', 'desc')));
        if (!mounted) return;

        const allRows = snapshot.docs.map((document) => {
          const data = document.data() as Record<string, any>;
          const status = String(data.status || data.approvalStatus || 'pending').toLowerCase() as OwnerAdvertisement['status'];

          // Legacy/backfill-safe extraction of common owner fields from older documents
          const candidateUid =
            (typeof data.ownerUid === 'string' && data.ownerUid) ||
            (typeof data.createdByUid === 'string' && data.createdByUid) ||
            (typeof data.userId === 'string' && data.userId) ||
            (typeof data.createdBy === 'string' && data.createdBy) ||
            (data.user && typeof data.user.uid === 'string' && data.user.uid) ||
            null;

          const candidateEmail =
            (typeof data.ownerEmail === 'string' && data.ownerEmail) ||
            (typeof data.email === 'string' && data.email) ||
            (typeof data.contactEmail === 'string' && data.contactEmail) ||
            (data.contact && typeof data.contact.email === 'string' && data.contact.email) ||
            (typeof data.createdByEmail === 'string' && data.createdByEmail) ||
            null;

          const candidateName =
            (typeof data.ownerName === 'string' && data.ownerName) ||
            (typeof data.displayName === 'string' && data.displayName) ||
            (data.user && typeof data.user.displayName === 'string' && data.user.displayName) ||
            null;

          const candidatePhone =
            (typeof data.ownerPhoneNumber === 'string' && data.ownerPhoneNumber) ||
            (typeof data.mobileNumber === 'string' && data.mobileNumber) ||
            (data.contact && typeof data.contact.phone === 'string' && data.contact.phone) ||
            null;

          return {
            id: document.id,
            name: String(data.name || ''),
            mobileNumber: String(data.mobileNumber || ''),
            country: String(data.country || ''),
            state: String(data.state || ''),
            area: String(data.area || ''),
            description: String(data.description || ''),
            status: status === 'approved' || status === 'rejected' ? status : 'pending',
            approvalStatus: data.approvalStatus || status,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            ownerUid: candidateUid,
            ownerEmail: candidateEmail,
            ownerName: candidateName,
            ownerPhoneNumber: candidatePhone,
          } as OwnerAdvertisement;
        });

        const rows = allRows.filter((item) => {
          const matchesEmail = currentUser.email && normalizeKey(item.ownerEmail || item.email) === normalizeKey(currentUser.email);
          return Boolean(matchesEmail);
        });

        setOwnerAds(rows);
      } catch (error) {
        if (mounted) {
          setOwnerAdsError(error instanceof Error ? error.message : 'Failed to load your advertisements');
        }
      } finally {
        if (mounted) setOwnerAdsLoading(false);
      }
    };

    void loadOwnerAds();

    return () => {
      mounted = false;
    };
  }, [accessGranted, currentUser]);

  const filteredOwnerAds = useMemo(() => {
    const term = ownerSearch.trim().toLowerCase();
    if (!term) return ownerAds;

    return ownerAds.filter((item) => {
      const emailHaystack = [item.ownerEmail, profileEmail, item.name].join(' ').toLowerCase();
      return emailHaystack.includes(term);
    });
  }, [ownerAds, ownerSearch]);

  const ownerStatusCounts = useMemo(() => {
    return ownerAds.reduce(
      (accumulator, item) => {
        accumulator[item.status] += 1;
        return accumulator;
      },
      { pending: 0, approved: 0, rejected: 0 },
    );
  }, [ownerAds]);

  const isMissingCredentialAccountError = (value: unknown) => {
    const code = (value as { code?: string })?.code;
    return code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password';
  };

  const handleAccessSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!profileEmail) {
      setError('Please sign in to load your profile email before continuing.');
      return;
    }

    if (requiresPasswordSetup) {
      if (!password || password.length < 6) {
        setError('Password should be at least 6 characters.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Password and confirm password do not match.');
        return;
      }
    } else if (!password) {
      setError('Password is required.');
      return;
    }

    try {
      setIsSubmitting(true);

      if (requiresPasswordSetup) {
        if (currentUser) {
          await changePassword(password);
        } else {
          await signup(profileEmail, password);
        }
        setSuccess('Your advertisement password is ready.');
      } else {
        try {
          await login(profileEmail, password);
          setSuccess('Signed in successfully.');
        } catch (loginError) {
          if (!currentUser && isMissingCredentialAccountError(loginError)) {
            await signup(profileEmail, password);
            setSuccess('Account created and signed in successfully.');
          } else {
            throw loginError;
          }
        }
      }

      setAccessGranted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to continue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center rounded-4xl border border-white/20 bg-white/80 p-8 text-center shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">Loading advertisement access</p>
        </div>
      </main>
    );
  }

  if (!accessGranted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.20),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.20),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.94))] px-4 py-8 dark:bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <section className="space-y-6 rounded-4xl border border-white/20 bg-white/85 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/75">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              <Sparkles className="h-3.5 w-3.5" />
              Advertisement access
            </div>

            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                {requiresPasswordSetup ? 'Create your ad password.' : 'Sign in to open advertisements.'}
              </h1>
              <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
                {requiresPasswordSetup
                  ? 'We pulled your email from your profile. Set a password once, then use the same email and password next time.'
                  : 'We pulled your email from your profile. Enter the password for this account to continue to the advertisement form.'}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleAccessSubmit}>
              <div className="space-y-2">
                <Label htmlFor="advertisement-email">Email</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    id="advertisement-email"
                    value={email}
                    disabled={Boolean(profileEmail)}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email from your profile"
                    className="pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="advertisement-password">Password</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    id="advertisement-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={requiresPasswordSetup ? 'Create a password' : 'Enter your password'}
                    className="pl-10 pr-10"
                    autoComplete={requiresPasswordSetup ? 'new-password' : 'current-password'}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {requiresPasswordSetup && (
                <div className="space-y-2">
                  <Label htmlFor="advertisement-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Input
                      id="advertisement-confirm-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      className="pl-10 pr-10"
                      autoComplete="new-password"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-200">
                  {success}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="gap-2 rounded-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Please wait...' : requiresPasswordSetup ? 'Create Password and Continue' : 'Sign In and Continue'}
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/">Back to Home</Link>
                </Button>
              </div>
            </form>
          </section>

          <section className="space-y-6 rounded-4xl border border-white/20 bg-white/80 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                <Megaphone className="h-3.5 w-3.5" />
                Advertisement workflow
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Match the admin-style view on user side</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                The email is loaded from your profile, saved with your ads, and the records below use the same card-style layout as the admin panel.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-1">
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <Megaphone className="h-5 w-5 text-rose-500" />
                <p className="mt-3 text-sm font-semibold">Profile email</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Loaded automatically and saved with each submission.</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <ShieldCheck className="h-5 w-5 text-orange-500" />
                <p className="mt-3 text-sm font-semibold">Status tracking</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Pending, approved, and rejected ads show in clear cards.</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <p className="mt-3 text-sm font-semibold">Same record format</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">The user section now matches the admin record-card style more closely.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

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

            <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/75 p-5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">Pricing</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">Choose the placement that fits your business</h3>
                </div>
                <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
                  Pricing is simple and centered around how much visibility you want on the travel page.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Starter</p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-black text-slate-950 dark:text-white">₹499</span>
                    <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ month</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Best for a single location and one basic banner.</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <li>• One live ad</li>
                    <li>• Standard placement</li>
                    <li>• Email support</li>
                  </ul>
                </article>

                <article className="rounded-3xl border border-rose-300 bg-rose-50 p-4 shadow-lg shadow-rose-500/10 dark:border-rose-700 dark:bg-rose-950/30">
                  <div className="inline-flex rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                    Most popular
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Growth</p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-black text-slate-950 dark:text-white">₹999</span>
                    <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ month</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">For businesses that want stronger visibility and more clicks.</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <li>• Three active ads</li>
                    <li>• Featured placement</li>
                    <li>• Priority review</li>
                  </ul>
                </article>

                <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Premium</p>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-3xl font-black text-slate-950 dark:text-white">₹1,999</span>
                    <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">/ month</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">For full brand visibility across your target area.</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <li>• Unlimited campaigns</li>
                    <li>• Top placement</li>
                    <li>• Direct support</li>
                  </ul>
                </article>
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
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </section>

        <div className="space-y-6">
          <AdvertisementForm submitLabel="Submit for Approval" defaultStatus="pending" mode="public" />

          <section className="space-y-5 rounded-4xl border border-white/20 bg-white/85 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/75">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Your advertisements</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Search the ads you submitted and track whether they are pending, approved, or rejected.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-300">Pending {ownerStatusCounts.pending}</span>
                <span className="rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/40 dark:text-emerald-300">Approved {ownerStatusCounts.approved}</span>
                <span className="rounded-full border border-rose-300/70 bg-rose-50 px-3 py-1 text-rose-700 dark:border-rose-700/70 dark:bg-rose-950/40 dark:text-rose-300">Rejected {ownerStatusCounts.rejected}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="owner-ad-search">Search your advertisements</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="owner-ad-search"
                  value={ownerSearch}
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  placeholder="Search by email only"
                  className="pl-9"
                />
              </div>
            </div>

            {ownerAdsLoading ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                Loading your submitted advertisements...
              </div>
            ) : ownerAdsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                {ownerAdsError}
              </div>
            ) : filteredOwnerAds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                {ownerSearch.trim()
                  ? 'No advertisements match your search.'
                  : 'You have not submitted any advertisements yet.'}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredOwnerAds.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-3xl border border-border/70 bg-background/80 shadow-lg">
                    <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-linear-to-r from-rose-500/10 via-orange-500/10 to-amber-500/10 p-4">
                      <div>
                        <h3 className="text-lg font-bold text-foreground">{item.name}</h3>
                        <p className="text-sm text-muted-foreground">{item.area}, {item.state}, {item.country}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                          item.status === 'approved'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : item.status === 'rejected'
                              ? 'border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="grid gap-3 p-4 text-sm text-muted-foreground">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Mobile</p>
                          <p className="mt-1 font-medium text-foreground">{item.mobileNumber}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Email</p>
                          <p className="mt-1 font-medium text-foreground">{item.ownerEmail || profileEmail}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Description</p>
                        <p className="mt-1 text-sm text-foreground/90">{item.description || 'No description provided'}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        Approval status is tracked in the badge above.
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
