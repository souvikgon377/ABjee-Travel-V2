"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, Clock3, Eye, EyeOff, Lock, Mail, Megaphone, Search, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { AdvertisementForm } from '@/components/ui/advertisement-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreDb } from '@/lib/firebaseFirestore';
import { auth } from '@/lib/firebase';

type OwnerAdvertisement = {
  id: string;
  name: string;
  mobileNumber: string;
  category?: string;
  country: string;
  state: string;
  area: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
  updatedAt?: any;
  subscriptionExpiresAt?: string;
  ownerUid?: string | null;
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerPhoneNumber?: string | null;
  photoUrl?: string | null;
  idProofUrl?: string | null;
  additionalIdProofs?: Array<{ url: string; publicId: string; name: string }> | null;
  editedByUid?: string | null;
  editedByEmail?: string | null;
  editedAt?: any;
  plan?: string;
  paid?: boolean;
};

const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const formatTimestamp = (value: any) => {
  try {
    if (!value) return '';
    // Firestore Timestamp
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleString();
    }
    // seconds / milliseconds
    if (typeof value === 'object' && 'seconds' in value) {
      return new Date((value as any).seconds * 1000).toLocaleString();
    }
    const n = Number(value);
    if (!Number.isNaN(n)) {
      const ms = n < 10000000000 ? n * 1000 : n;
      return new Date(ms).toLocaleString();
    }
    return String(value);
  } catch {
    return '';
  }
};

const formatValidityDate = (isoStr?: string | number) => {
  if (!isoStr) return 'Starts upon approval';
  try {
    const n = Number(isoStr);
    if (!Number.isNaN(n)) {
      const ms = n < 10000000000 ? n * 1000 : n;
      if (Math.floor(ms / 1000) === 4102444800) {
        return 'Starts upon approval';
      }
      return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return new Date(isoStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'Invalid date';
  }
};

const isExpired = (isoStr?: string | number) => {
  if (!isoStr) return false;
  try {
    const n = Number(isoStr);
    if (!Number.isNaN(n)) {
      const ms = n < 10000000000 ? n * 1000 : n;
      if (Math.floor(ms / 1000) === 4102444800) {
        return false;
      }
      return ms < Date.now();
    }
    return new Date(isoStr).getTime() < Date.now();
  } catch {
    return false;
  }
};

const isSubscriptionActive = (plan: string | null, verifiedAt: string | null, createdAt: string | null) => {
  if (!plan) return false;
  const dateStr = verifiedAt || createdAt;
  if (!dateStr) return true; // legacy support
  try {
    const time = new Date(dateStr).getTime();
    const now = Date.now();
    let durationMs = 0;
    if (plan === 'monthly') durationMs = 30 * 24 * 60 * 60 * 1000;
    else if (plan === 'quarterly') durationMs = 90 * 24 * 60 * 60 * 1000;
    else if (plan === 'yearly') durationMs = 365 * 24 * 60 * 60 * 1000;
    else return false;
    return time + durationMs > now;
  } catch {
    return false;
  }
};

export default function AdvertisementPage() {
  const { currentUser, userProfile, loading, login, signup, changePassword, logout, resetPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  // inline success state removed — success is no longer shown in the form
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [ownerAds, setOwnerAds] = useState<OwnerAdvertisement[]>([]);
  const [ownerAdsLoading, setOwnerAdsLoading] = useState(false);
  const [ownerAdsError, setOwnerAdsError] = useState('');
  const [editingAd, setEditingAd] = useState<OwnerAdvertisement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [showNewForm, setShowNewForm] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [pricing, setPricing] = useState({
    currency: 'INR',
    adMonthly: 100,
    adQuarterly: 250,
    adYearly: 800,
  });
  const [paidPlan, setPaidPlan] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [paymentVerifiedAt, setPaymentVerifiedAt] = useState<string | null>(null);
  const [paymentCreatedAt, setPaymentCreatedAt] = useState<string | null>(null);
  const [adLimits, setAdLimits] = useState({
    monthly: 1,
    quarterly: 3,
    yearly: -1,
  });
  const [adDescriptions, setAdDescriptions] = useState({
    monthly: 'Best for a single location and one basic banner.',
    quarterly: 'For businesses that want stronger visibility and more clicks.',
    yearly: 'For full brand visibility across your target area.',
  });
  const [adFeatures, setAdFeatures] = useState({
    adMonthlyFeatures: 'One live ad\nStandard placement\nEmail support',
    adQuarterlyFeatures: 'Three active ads\nFeatured placement\nPriority review',
    adYearlyFeatures: 'Unlimited campaigns\nTop placement\nDirect support',
  });

  useEffect(() => {
    let active = true;
    fetch('/api/public/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data?.data) {
          const d = data.data;
          if (d.pricing) {
            setPricing({
              currency: d.pricing.currency || 'INR',
              adMonthly: Number(d.pricing.adMonthly) || 100,
              adQuarterly: Number(d.pricing.adQuarterly) || 250,
              adYearly: Number(d.pricing.adYearly) || 800,
            });
          }
          if (d.adLimits) {
            setAdLimits({
              monthly: Number(d.adLimits.monthly) ?? 1,
              quarterly: Number(d.adLimits.quarterly) ?? 3,
              yearly: Number(d.adLimits.yearly) ?? -1,
            });
          }
          if (d.adDescriptions) {
            setAdDescriptions({
              monthly: String(d.adDescriptions.monthly || '').trim() || 'Best for a single location and one basic banner.',
              quarterly: String(d.adDescriptions.quarterly || '').trim() || 'For businesses that want stronger visibility and more clicks.',
              yearly: String(d.adDescriptions.yearly || '').trim() || 'For full brand visibility across your target area.',
            });
          }
          if (d.features) {
            setAdFeatures({
              adMonthlyFeatures: typeof d.features.adMonthlyFeatures === 'string' ? d.features.adMonthlyFeatures : 'One live ad\nStandard placement\nEmail support',
              adQuarterlyFeatures: typeof d.features.adQuarterlyFeatures === 'string' ? d.features.adQuarterlyFeatures : 'Three active ads\nFeatured placement\nPriority review',
              adYearlyFeatures: typeof d.features.adYearlyFeatures === 'string' ? d.features.adYearlyFeatures : 'Unlimited campaigns\nTop placement\nDirect support',
            });
          }
        }
      })
      .catch((err) => console.error('Failed to load public settings:', err));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/advertisements/payment/check')
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data?.paidPlan) {
          setPaidPlan(data.data.paidPlan);
          setPaymentId(data.data.paymentId);
          setPaymentVerifiedAt(data.data.verifiedAt);
          setPaymentCreatedAt(data.data.createdAt);
        } else {
          setPaidPlan(null);
          setPaymentId(null);
          setPaymentVerifiedAt(null);
          setPaymentCreatedAt(null);
        }
      })
      .catch((err) => console.error('Failed to check ad payment status:', err));
  }, [currentUser]);

  const loadRazorpayScript = () => {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if ((window as any).Razorpay) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribeNow = async (plan: 'monthly' | 'quarterly' | 'yearly') => {
    if (!currentUser) {
      alert('Please log in to continue with the subscription payment.');
      return;
    }
    setPaymentLoading(plan);
    try {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) {
        throw new Error('Unable to load Razorpay SDK. Please check your network connection.');
      }

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const orderRes = await fetch('/api/advertisements/payment/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const orderPayload = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderPayload?.success) {
        throw new Error(orderPayload?.message || 'Failed to initialize payment order.');
      }

      const orderData = orderPayload.data;
      const checkout = new (window as any).Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'ABjee Travel',
        description: `Advertisement ${plan} subscription`,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/advertisements/payment/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                ...response,
                plan,
              }),
            });

            const verifyPayload = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok || !verifyPayload?.success) {
              throw new Error(verifyPayload?.message || 'Payment verification failed.');
            }

            setPaidPlan(plan);
            setPaymentId(verifyPayload.data.paymentId);
            fetch('/api/advertisements/payment/check')
              .then((res) => res.json())
              .then((data) => {
                if (data?.success && data?.data?.paidPlan) {
                  setPaidPlan(data.data.paidPlan);
                  setPaymentId(data.data.paymentId);
                  setPaymentVerifiedAt(data.data.verifiedAt);
                  setPaymentCreatedAt(data.data.createdAt);
                }
              })
              .catch((err) => console.error('Failed to sync plan state:', err));
            alert(`Subscription payment completed successfully for the ${plan} plan!`);
          } catch (verifyError: any) {
            alert(verifyError.message || 'Verification failed. Please contact support.');
          }
        },
        prefill: {
          name: currentUser.displayName || '',
          email: currentUser.email || '',
        },
        theme: {
          color: '#e11d48',
        },
      });

      checkout.open();
    } catch (err: any) {
      alert(err.message || 'Payment flow error occurred. Please try again.');
    } finally {
      setPaymentLoading(null);
    }
  };

  const activeAdCount = useMemo(() => {
    return ownerAds.filter((ad) => ad.status !== 'rejected').length;
  }, [ownerAds]);

  const activeAdPlanDetails = useMemo(() => {
    const approvedAds = ownerAds.filter(
      (ad) => ad.status === 'approved' && !isExpired(ad.subscriptionExpiresAt)
    );
    if (approvedAds.length === 0) return null;
    return approvedAds[0];
  }, [ownerAds]);

  const effectivePaidPlan = useMemo(() => {
    if (paidPlan) return paidPlan;
    return activeAdPlanDetails?.plan || null;
  }, [paidPlan, activeAdPlanDetails]);

  const isPlanActive = useMemo(() => {
    if (paidPlan) {
      return isSubscriptionActive(paidPlan, paymentVerifiedAt, paymentCreatedAt);
    }
    return activeAdPlanDetails !== null;
  }, [paidPlan, paymentVerifiedAt, paymentCreatedAt, activeAdPlanDetails]);

  const currentPlanLimit = useMemo(() => {
    if (!isPlanActive || !effectivePaidPlan) return 0;
    const plan = effectivePaidPlan.toLowerCase();
    if (plan === 'monthly') return adLimits.monthly;
    if (plan === 'quarterly') return adLimits.quarterly;
    if (plan === 'yearly') return adLimits.yearly;
    return 0;
  }, [isPlanActive, effectivePaidPlan, adLimits]);

  const isLimitReached = useMemo(() => {
    if (!isPlanActive) return true;
    if (currentPlanLimit === -1) return false;
    return activeAdCount >= currentPlanLimit;
  }, [isPlanActive, currentPlanLimit, activeAdCount]);

  const showSubscriptionButtons = useMemo(() => {
    return !isPlanActive || isLimitReached;
  }, [isPlanActive, isLimitReached]);

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

  const loadOwnerAds = async () => {
    setOwnerAdsLoading(true);
    setOwnerAdsError('');

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const response = await fetch('/api/advertisements/my-ads', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to load advertisements: ${response.statusText}`);
      }
      const payload = await response.json();
      const rows = (payload.data?.data || []).map((data: any) => {
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

        const candidateEditedByEmail =
          (typeof data.editedByEmail === 'string' && data.editedByEmail) ||
          (typeof data.lastEditedByEmail === 'string' && data.lastEditedByEmail) ||
          (data.editedBy && typeof data.editedBy.email === 'string' && data.editedBy.email) ||
          null;

        const candidateEditedByUid =
          (typeof data.editedByUid === 'string' && data.editedByUid) ||
          (data.editedBy && typeof data.editedBy.uid === 'string' && data.editedBy.uid) ||
          null;

        const candidateEditedAt = data.editedAt || data.lastEditedAt || null;

        return {
          id: data.id,
          name: String(data.name || ''),
          mobileNumber: String(data.mobileNumber || ''),
          category: String(data.category || ''),
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
          photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : (typeof data.imageUrl === 'string' ? data.imageUrl : null),
          idProofUrl: typeof data.idProofUrl === 'string' ? data.idProofUrl : (typeof data.id_proof_url === 'string' ? data.id_proof_url : null),
          additionalIdProofs: data.additionalIdProofs
            ? (typeof data.additionalIdProofs === 'string'
              ? (data.additionalIdProofs.startsWith('[') ? JSON.parse(data.additionalIdProofs) : [])
              : data.additionalIdProofs)
            : [],
          editedByUid: candidateEditedByUid,
          editedByEmail: candidateEditedByEmail,
          editedAt: candidateEditedAt,
          subscriptionExpiresAt: data.subscriptionExpiresAt || null,
          plan: data.plan || 'monthly',
          paid: data.paid === true,
        } as OwnerAdvertisement;
      });

      setOwnerAds(rows);
    } catch (error) {
      setOwnerAdsError(error instanceof Error ? error.message : 'Failed to load your advertisements');
    } finally {
      setOwnerAdsLoading(false);
    }
  };

  useEffect(() => {
    if (!accessGranted || !currentUser) return;
    void loadOwnerAds();
  }, [accessGranted, currentUser]);

  // Scroll form into view when entering edit mode
  useEffect(() => {
    if (editingAd && formRef.current) {
      // Small timeout to allow layout to update
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }, [editingAd]);

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
      } else {
        try {
          await login(profileEmail, password);
        } catch (loginError) {
          if (!currentUser && isMissingCredentialAccountError(loginError)) {
            await signup(profileEmail, password);
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
      <main className="min-h-screen px-4 pb-8 pt-28 sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center rounded-4xl border border-white/20 bg-white/80 p-8 text-center shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">Loading Registration access</p>
        </div>
      </main>
    );
  }

  if (!accessGranted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.20),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.20),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.94))] px-4 pb-8 pt-28 dark:bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <section className="space-y-6 rounded-4xl border border-white/20 bg-white/85 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/75">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              <Sparkles className="h-3.5 w-3.5" />
              Registration access
            </div>

            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                {requiresPasswordSetup ? 'Create your ad password.' : 'Sign In to Register your Business with Us'}
              </h1>
              <p className="max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
                {requiresPasswordSetup
                  ? 'We pulled your email from your profile. Set a password once, then use the same email and password next time.'
                  : 'We pulled your email from your profile. Enter the password for this account to continue to the Registration form.'}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleAccessSubmit}>
              <div className="space-y-2">
                <Label htmlFor="Registration-email">Email</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    id="Registration-email"
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
                <Label htmlFor="Registration-password">Password</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Input
                    id="Registration-password"
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
                  <Label htmlFor="Registration-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <Input
                      id="Registration-confirm-password"
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

              {/* success message removed per request */}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" className="gap-2 rounded-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Please wait...' : requiresPasswordSetup ? 'Create Password and Continue' : 'Sign In and Continue'}
                </Button>
                <Button type="button" variant="ghost" className="rounded-full" onClick={async () => {
                  setForgotMessage(null);
                  const targetEmail = profileEmail || email;
                  if (!targetEmail) {
                    setForgotMessage('No email available to send reset.');
                    return;
                  }
                  try {
                    setForgotLoading(true);
                    await resetPassword(targetEmail);
                    setForgotMessage('If an account exists for that email, a password reset link has been sent.');
                  } catch (err: any) {
                    setForgotMessage(err?.message || 'Failed to send reset email.');
                  } finally {
                    setForgotLoading(false);
                  }
                }}>
                  {forgotLoading ? 'Sending…' : 'Forgot password?'}
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/">Back to Home</Link>
                </Button>
              </div>
              {forgotMessage && (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white/80 p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-slate-900/60 dark:text-gray-200">
                  {forgotMessage}
                </div>
              )}
            </form>
          </section>

          <section className="space-y-6 rounded-4xl border border-white/20 bg-white/80 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                <Megaphone className="h-3.5 w-3.5" />
                Registration workflow
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.20),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.20),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,247,237,0.94))] px-4 pb-8 pt-28 dark:bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.96))] sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
      {currentUser && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={() => {
                setAccessGranted(false);
                // Do not sign the user out of the whole site — only exit the Registration flow
                router.push('/advertisement');
              }}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Exit Registration
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl space-y-6">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <section className="flex flex-col space-y-6 rounded-4xl border border-white/20 bg-white/80 p-6 shadow-2xl shadow-rose-500/10 backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            <Sparkles className="h-3.5 w-3.5" />
            New Registration Request
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
                <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Monthly Plan</p>
                    <div className="mt-2 flex items-end gap-1 flex-nowrap">
                      <span className="text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">
                        {pricing.currency === 'INR' ? '₹' : pricing.currency + ' '}
                        {pricing.adMonthly}
                      </span>
                      <span className="pb-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">/ month</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{adDescriptions.monthly}</p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-4">
                      {adFeatures.adMonthlyFeatures.split('\n').filter(line => line.trim()).map((feat, idx) => (
                        <li key={idx}>{feat.trim().replace(/^[•\-\*]\s*/, '')}</li>
                      ))}
                    </ul>
                  </div>
                  {(showSubscriptionButtons || effectivePaidPlan === 'monthly') && (
                    <Button
                      type="button"
                      disabled={paymentLoading !== null || (isPlanActive && effectivePaidPlan === 'monthly')}
                      onClick={() => handleSubscribeNow('monthly')}
                      className={`mt-6 w-full rounded-full font-semibold ${
                        isPlanActive && effectivePaidPlan === 'monthly'
                          ? 'bg-emerald-600 hover:bg-emerald-600 text-white cursor-default'
                          : 'bg-rose-600 hover:bg-rose-700 text-white'
                      }`}
                    >
                      {paymentLoading === 'monthly'
                        ? 'Processing...'
                        : isPlanActive && effectivePaidPlan === 'monthly'
                        ? 'Subscribed ✓'
                        : 'Subscribe Now'}
                    </Button>
                  )}
                </article>

                <article className="rounded-3xl border border-rose-300 bg-rose-50 p-4 shadow-lg shadow-rose-500/10 dark:border-rose-700 dark:bg-rose-950/30 flex flex-col justify-between">
                  <div>
                    <div className="inline-flex rounded-full border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                      Most popular
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Quarterly Plan</p>
                    <div className="mt-2 flex items-end gap-1 flex-nowrap">
                      <span className="text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">
                        {pricing.currency === 'INR' ? '₹' : pricing.currency + ' '}
                        {pricing.adQuarterly}
                      </span>
                      <span className="pb-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">/ 3 months</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{adDescriptions.quarterly}</p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-4">
                      {adFeatures.adQuarterlyFeatures.split('\n').filter(line => line.trim()).map((feat, idx) => (
                        <li key={idx}>{feat.trim().replace(/^[•\-\*]\s*/, '')}</li>
                      ))}
                    </ul>
                  </div>
                  {(showSubscriptionButtons || effectivePaidPlan === 'quarterly') && (
                    <Button
                      type="button"
                      disabled={paymentLoading !== null || (isPlanActive && effectivePaidPlan === 'quarterly')}
                      onClick={() => handleSubscribeNow('quarterly')}
                      className={`mt-6 w-full rounded-full font-semibold ${
                        isPlanActive && effectivePaidPlan === 'quarterly'
                          ? 'bg-emerald-600 hover:bg-emerald-600 text-white cursor-default'
                          : 'bg-rose-600 hover:bg-rose-700 text-white'
                      }`}
                    >
                      {paymentLoading === 'quarterly'
                        ? 'Processing...'
                        : isPlanActive && effectivePaidPlan === 'quarterly'
                        ? 'Subscribed ✓'
                        : 'Subscribe Now'}
                    </Button>
                  )}
                </article>

                <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Yearly Plan</p>
                    <div className="mt-2 flex items-end gap-1 flex-nowrap">
                      <span className="text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap">
                        {pricing.currency === 'INR' ? '₹' : pricing.currency + ' '}
                        {pricing.adYearly}
                      </span>
                      <span className="pb-1 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">/ year</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{adDescriptions.yearly}</p>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-disc pl-4">
                      {adFeatures.adYearlyFeatures.split('\n').filter(line => line.trim()).map((feat, idx) => (
                        <li key={idx}>{feat.trim().replace(/^[•\-\*]\s*/, '')}</li>
                      ))}
                    </ul>
                  </div>
                  {(showSubscriptionButtons || effectivePaidPlan === 'yearly') && (
                    <Button
                      type="button"
                      disabled={paymentLoading !== null || (isPlanActive && effectivePaidPlan === 'yearly')}
                      onClick={() => handleSubscribeNow('yearly')}
                      className={`mt-6 w-full rounded-full font-semibold ${
                        isPlanActive && effectivePaidPlan === 'yearly'
                          ? 'bg-emerald-600 hover:bg-emerald-600 text-white cursor-default'
                          : 'bg-rose-600 hover:bg-rose-700 text-white'
                      }`}
                    >
                      {paymentLoading === 'yearly'
                        ? 'Processing...'
                        : isPlanActive && effectivePaidPlan === 'yearly'
                        ? 'Subscribed ✓'
                        : 'Subscribe Now'}
                    </Button>
                  )}
                </article>
              </div>
            </div>

          <div className="mt-auto space-y-4">
            <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100">
              If you are an admin, open the dashboard to approve submissions or add a live Registration directly.
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
              <Button
                type="button"
                variant="ghost"
                className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:opacity-90"
                onClick={() => {
                  setAccessGranted(false);
                  // Do not sign the user out globally
                  router.push('/advertisement');
                }}
              >
                Exit Registration
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {editingAd ? (
            <div ref={formRef}>
            <AdvertisementForm
              submitLabel="Save changes"
              isFirstAd={ownerAds.length === 0}
              paidPlan={effectivePaidPlan}
              paymentId={paymentId}
              adId={editingAd.id}
              activeAdCount={activeAdCount}
              adLimit={currentPlanLimit}
              isSubscriptionExpired={effectivePaidPlan ? !isPlanActive : false}
              initialValues={{
                name: editingAd.name,
                mobileNumber: editingAd.mobileNumber,
                category: editingAd.category,
                country: editingAd.country,
                state: editingAd.state,
                area: editingAd.area,
                description: editingAd.description,
                photoUrl: editingAd.photoUrl || undefined,
                idProofUrl: editingAd.idProofUrl || undefined,
                ownerName: editingAd.ownerName || undefined,
                ownerPhoneNumber: editingAd.ownerPhoneNumber || undefined,
                additionalIdProofs: editingAd.additionalIdProofs || [],
                plan: (editingAd as any).plan || 'monthly',
              }}
              onSubmitted={(id) => {
                setEditingAd(null);
                setShowNewForm(false);
                setSuccessMessage('Registration updated and sent for admin approval.');
                void loadOwnerAds();
                // clear success after a short delay so user can create a new ad later
                setTimeout(() => setSuccessMessage(''), 8000);
              }}
            />
            </div>
          ) : (
            <div ref={formRef}>
              {showNewForm ? (
                <AdvertisementForm 
                  submitLabel="Submit for Approval" 
                  isFirstAd={ownerAds.length === 0} 
                  paidPlan={effectivePaidPlan}
                  paymentId={paymentId}
                  activeAdCount={activeAdCount}
                  adLimit={currentPlanLimit}
                  isSubscriptionExpired={effectivePaidPlan ? !isPlanActive : false}
                  defaultStatus="pending" 
                  mode="public" 
                  onSubmitted={() => {
                    setPaidPlan(null);
                    setPaymentId(null);
                    void loadOwnerAds();
                  }} 
                />
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/10 p-4">
                  <p className="font-semibold text-foreground">{successMessage || 'Registration sent for admin approval.'}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {isLimitReached ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold mt-1">
                        You have reached the advertisement limit of your plan. Please upgrade or extend your subscription to post more ads.
                      </p>
                    ) : (
                      <button type="button" className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white w-max" onClick={() => setShowNewForm(true)}>
                        Create another ad
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredOwnerAds.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-2xl border border-border/70 bg-background/80 shadow-md flex flex-col">
                    {/* Header with photo background */}
                    <div
                      className="relative flex items-start justify-between gap-2 p-3 min-h-[160px]"
                      style={item.photoUrl ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.35)), url(${item.photoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-sm font-bold leading-tight truncate ${item.photoUrl ? 'text-white' : 'text-foreground'}`}>{item.name}</h3>
                        <p className={`text-xs mt-0.5 truncate ${item.photoUrl ? 'text-white/80' : 'text-muted-foreground'}`}>{[item.area, item.state, item.country].filter(Boolean).join(', ')}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          item.status === 'approved'
                            ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : item.status === 'rejected'
                              ? 'border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="flex flex-col gap-2 p-3 text-xs flex-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Mobile</p>
                          <p className="mt-0.5 font-medium text-foreground truncate">{item.mobileNumber || item.ownerPhoneNumber || '—'}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Owner</p>
                          <p className="mt-0.5 font-medium text-foreground truncate">{item.ownerName || '—'}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
                        <p className="mt-0.5 font-medium text-foreground truncate" title={item.ownerEmail || profileEmail}>{item.ownerEmail || profileEmail || '—'}</p>
                      </div>

                      <div className="rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Subscription Validity</p>
                        <p className="mt-0.5 font-semibold text-foreground">
                          {item.status === 'approved' ? (
                            isExpired(item.subscriptionExpiresAt) ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider text-xs">
                                Expired
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Valid until {formatValidityDate(item.subscriptionExpiresAt)}
                              </span>
                            )
                          ) : item.status === 'rejected' ? (
                            <span className="text-rose-600 dark:text-rose-400">N/A</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">Starts upon approval</span>
                          )}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5 capitalize">
                          Plan: {(item as any).plan || 'monthly'} • {(item as any).paid === true ? 'Paid' : 'Free Trial/Promo'}
                        </p>
                      </div>

                      {item.description && (
                        <div className="rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Description</p>
                          <p className="mt-0.5 text-foreground/90 line-clamp-2">{item.description}</p>
                        </div>
                      )}

                      <div className="flex justify-between text-[10px] text-muted-foreground mt-auto pt-1">
                        <span>Created: <span className="text-foreground">{formatTimestamp(item.createdAt)}</span></span>
                        <span>Updated: <span className="text-foreground">{formatTimestamp(item.updatedAt)}</span></span>
                      </div>
                    </div>

                    {/* Footer */}
                    {(currentUser && (normalizeKey(item.ownerEmail || '') === normalizeKey(currentUser.email) || (item.ownerUid && currentUser.uid && item.ownerUid === currentUser.uid))) && (
                      <div className="border-t border-border/60 p-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingAd(item)}
                          className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
      </div>
    </main>
  );
}
