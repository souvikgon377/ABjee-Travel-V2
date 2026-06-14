'use client';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import NumberFlow from '@number-flow/react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { cn } from '../../lib/utils';
import { ArrowRight, Check, Star, Zap, Shield, Crown } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Input } from '@/components/ui/input';
import { ConfettiButton } from '@/components/ui/confetti';
import { getSubscriptionInfo, hasPaidAccess } from '@/lib/subscriptionPolicy';

const PLAN_ICONS: Record<string, React.ComponentType<any>> = {
  hobby: Star,
  pro: Zap,
  enterprise: Shield,
};

const DEFAULT_PLANS = [
  {
    id: 'hobby',
    name: 'Free',
    icon: Star,
    price: {
      monthly: 'Free forever',
      yearly: 'Free forever',
    },
    description:
      'Use public rooms and community features at no cost.',
    features: [
      'Public room chat and posting',
      'Public room creation',
      'No private room access',
      'Private rooms require paid subscription',
      'Basic community support',
    ],
    cta: 'Get started for free',
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Zap,
    price: {
      monthly: 2,
      yearly: 15,
    },
    description: 'Private groups and premium community access.',
    features: [
      'Create or join up to 3 private rooms (monthly)',
      'Create or join up to 10 private rooms (yearly)',
      'Private room access included',
      'Expose private rooms for join requests',
      'Priority support',
    ],
    cta: 'Subscribe Now',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Premium',
    icon: Shield,
    price: {
      monthly: 2,
      yearly: 15,
    },
    description: 'Same pricing with advanced travel member benefits.',
    features: [
      'Create or join up to 3 private rooms (monthly)',
      'Create or join up to 10 private rooms (yearly)',
      'Private room access included',
      'Advanced member tools',
      'Priority assistance',
    ],
    cta: 'Choose Premium',
  },
];

const generateFeaturesFromApi = (planId: string, features: any, adminFeatureText?: string): string[] => {
  // If admin has provided feature text, use that
  if (adminFeatureText && typeof adminFeatureText === 'string') {
    return adminFeatureText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  // Otherwise generate from features object (fallback)
  const featuresList: string[] = [];

  if (planId === 'hobby') {
    featuresList.push('Public room chat and posting');
    featuresList.push('Public room creation');
    featuresList.push('No private room access');
    featuresList.push('Private rooms require paid subscription');
    featuresList.push('Basic community support');
  } else if (planId === 'pro' || planId === 'enterprise') {
    // Private room limits - handle both monthly and yearly
    const monthlyLimit = features?.maxPrivateChats ?? 0;
    const yearlyLimit = features?.maxPrivateChatsYearly ?? monthlyLimit;
    
    if (monthlyLimit > 0) {
      featuresList.push(`Create or join up to ${monthlyLimit} private rooms (monthly)`);
    }
    if (yearlyLimit > 0 && yearlyLimit !== monthlyLimit) {
      featuresList.push(`Create or join up to ${yearlyLimit} private rooms (yearly)`);
    } else if (yearlyLimit > 0) {
      // If same as monthly, still show yearly if specified differently
      if (features?.maxPrivateChatsYearly !== undefined && features.maxPrivateChatsYearly !== features.maxPrivateChats) {
        featuresList.push(`Create or join up to ${yearlyLimit} private rooms (yearly)`);
      }
    }

    // Private room access
    if (features?.privateChatAccess) {
      featuresList.push('Private room access included');
    }

    // Plan-specific features
    if (planId === 'pro') {
      featuresList.push('Expose private rooms for join requests');
    }

    if (planId === 'enterprise') {
      if (features?.profileBoost) {
        featuresList.push('Advanced member tools');
      }
    }

    // Common premium features
    if (features?.prioritySupport) {
      featuresList.push(planId === 'enterprise' ? 'Priority assistance' : 'Priority support');
    }

    if (features?.advancedFilters) {
      featuresList.push('Advanced filtering options');
    }

    if (features?.customDestinations) {
      featuresList.push('Custom destination access');
    }
  }

  if (planId === 'advertizer') {
    if (features?.fileUploadLimit) {
      featuresList.push(`File upload limit: ${features.fileUploadLimit}`);
    }
    if (features?.prioritySupport) {
      featuresList.push('Priority support');
    }
    // use admin feature text if available via caller
  }

  // If no features were generated, use defaults
  return featuresList.length > 0 ? featuresList : DEFAULT_PLANS.find((p) => p.id === planId)?.features || [];
};

export default function SimplePricing() {
  const [frequency, setFrequency] = useState<string>('monthly');
  const [mounted, setMounted] = useState(false);
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [paymentConfirmation, setPaymentConfirmation] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [useRbPoints, setUseRbPoints] = useState(true);
  const [couponPreviewByPlan, setCouponPreviewByPlan] = useState<Record<string, {
    discountPercent: number;
    discountAmount: number;
    finalAmount: number;
    currency: string;
  }>>({});
  const { currentUser, userProfile, refreshUserProfile } = useAuth();
  const router = useRouter();
  const subscriptionInfo = useMemo(() => getSubscriptionInfo(userProfile), [userProfile]);
  const currentWalletMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const walletSummary = useMemo(() => {
    const wallet = (userProfile as any)?.wallet || {};
    const monthly = wallet.monthly || {};
    const availablePoints = Math.max(
      0,
      Math.floor(Number(wallet.availablePoints ?? wallet.availableRupees ?? 0)),
    );
    const monthlyCap = Math.max(0, Math.floor(Number(monthly.monthlyCapRupees || 30)));

    // Wallet month rolls over each calendar month; previous month redemption should not block current month.
    const monthKey = typeof monthly.monthKey === 'string' ? monthly.monthKey : '';
    const isCurrentWalletMonth = monthKey === currentWalletMonthKey;
    const monthlyRedeemed = isCurrentWalletMonth
      ? Math.max(0, Math.floor(Number(monthly.redeemedRupees || 0)))
      : 0;

    const monthlyRemaining = Math.max(0, monthlyCap - monthlyRedeemed);
    return {
      availablePoints,
      monthlyCap,
      monthlyRedeemed,
      monthlyRemaining,
      usablePoints: Math.min(availablePoints, monthlyRemaining),
    };
  }, [currentWalletMonthKey, userProfile]);
  const activePlanId = useMemo(() => {
    if (!hasPaidAccess(subscriptionInfo)) return null;

    const normalizedType = String(subscriptionInfo.type || 'free').toLowerCase();

    if (normalizedType === 'premium' || normalizedType === 'enterprise') {
      return 'enterprise';
    }

    if (normalizedType === 'pro' || normalizedType === 'paid' || normalizedType === 'paid-plan') {
      return 'pro';
    }

    return null;
  }, [subscriptionInfo]);

  const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  const loadRazorpayScript = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    if ((window as any).Razorpay) return true;

    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const getPlanType = (planId: string) => {
    if (planId === 'pro') return 'pro';
    if (planId === 'enterprise') return 'premium';
    return null;
  };

  const getRbDiscountForPlan = useCallback((planId: string) => {
    const rawPrice = plans.find((plan) => plan.id === planId)?.price[frequency as 'monthly' | 'yearly'];
    if (typeof rawPrice !== 'number') return 0;
    const couponAmount = couponPreviewByPlan[planId]?.finalAmount ?? rawPrice;
    if (!useRbPoints || walletSummary.usablePoints <= 0 || !getPlanType(planId)) return 0;
    return Math.min(walletSummary.usablePoints, couponAmount);
  }, [couponPreviewByPlan, frequency, plans, useRbPoints, walletSummary.usablePoints]);

  const getDiscountedPlanAmount = useCallback((planId: string) => {
    const rawPrice = plans.find((plan) => plan.id === planId)?.price[frequency as 'monthly' | 'yearly'];
    if (typeof rawPrice !== 'number') return rawPrice;
    const couponAmount = couponPreviewByPlan[planId]?.finalAmount ?? rawPrice;
    const rbDiscount = getRbDiscountForPlan(planId);
    return Math.max(0, couponAmount - rbDiscount);
  }, [couponPreviewByPlan, frequency, getRbDiscountForPlan, plans]);

  const validateCouponForCurrentFrequency = useCallback(async (rawCouponCode: string) => {
    const normalizedCode = rawCouponCode.trim().toUpperCase();
    if (!normalizedCode) {
      setAppliedCoupon(null);
      setCouponPreviewByPlan({});
      setCouponError(null);
      return false;
    }

    setApplyingCoupon(true);
    setCouponError(null);

    try {
      const paidPlans = plans.filter((plan) => plan.id === 'pro' || plan.id === 'enterprise');
      const previews: Record<string, {
        discountPercent: number;
        discountAmount: number;
        finalAmount: number;
        currency: string;
      }> = {};

      await Promise.all(
        paidPlans.map(async (plan) => {
          const planType = getPlanType(plan.id);
          if (!planType) return;

          const res = await fetch('/api/subscriptions/coupon/validate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              promoCode: normalizedCode,
              planType,
              interval: frequency,
            }),
          });

          const payload = await res.json().catch(() => ({}));
          if (!res.ok || !payload?.success) {
            return;
          }

          previews[plan.id] = {
            discountPercent: Number(payload.data.discountPercent || 0),
            discountAmount: Number(payload.data.discountAmount || 0),
            finalAmount: Number(payload.data.finalAmount || 0),
            currency: String(payload.data.currency || 'INR'),
          };
        }),
      );

      if (Object.keys(previews).length === 0) {
        throw new Error('Coupon is not valid for current paid plans.');
      }

      setAppliedCoupon(normalizedCode);
      setCouponPreviewByPlan(previews);
      setCouponInput(normalizedCode);
      setCouponError(null);
      return true;
    } catch (error: any) {
      setAppliedCoupon(null);
      setCouponPreviewByPlan({});
      setCouponError(error?.message || 'Unable to validate coupon right now.');
      return false;
    } finally {
      setApplyingCoupon(false);
    }
  }, [frequency]);

  useEffect(() => {
    if (!appliedCoupon) return;

    validateCouponForCurrentFrequency(appliedCoupon);
  }, [appliedCoupon, frequency, validateCouponForCurrentFrequency]);

  const triggerPaymentFireworks = useCallback(() => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        window.clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  }, []);

  const lockBodyScroll = useCallback(() => {
    if (typeof document === 'undefined') {
      return () => {};
    }

    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const previousOverflow = body.style.overflow;
    const previousPosition = body.style.position;
    const previousTop = body.style.top;
    const previousWidth = body.style.width;
    const previousTouchAction = body.style.touchAction;

    html.classList.add('payment-modal-open');
    body.classList.add('payment-modal-open');

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';

    return () => {
      body.style.position = previousPosition;
      body.style.top = previousTop;
      body.style.width = previousWidth;
      body.style.overflow = previousOverflow;
      body.style.touchAction = previousTouchAction;
      html.classList.remove('payment-modal-open');
      body.classList.remove('payment-modal-open');
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
  }, []);

  const handleSubscribe = useCallback(async (planId: string) => {
    const planType = getPlanType(planId);

    if (!planType) {
      router.push('/community');
      return;
    }

    if (!currentUser || !auth.currentUser) {
      alert('Please login to continue with subscription.');
      router.push('/auth');
      return;
    }

    setProcessingPlan(planId);
    let releaseBodyScrollLock: (() => void) | null = null;
    let checkoutOpened = false;

    try {
      const token = await auth.currentUser.getIdToken();

      if (appliedCoupon) {
        const validateRes = await fetch('/api/subscriptions/coupon/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            promoCode: appliedCoupon,
            planType,
            interval: frequency,
          }),
        });

        const validatePayload = await validateRes.json().catch(() => ({}));
        const finalAmount = Number(validatePayload?.data?.finalAmount ?? Number.NaN);

        if (validateRes.ok && validatePayload?.success && Number.isFinite(finalAmount) && finalAmount <= 0) {
          const redeemRes = await fetch('/api/subscriptions/coupon/redeem', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              promoCode: appliedCoupon,
              planType,
              interval: frequency,
            }),
          });

          const redeemPayload = await redeemRes.json().catch(() => ({}));
          if (!redeemRes.ok || !redeemPayload?.success) {
            throw new Error(redeemPayload?.message || 'Failed to redeem coupon.');
          }

          const currentScrollY = window.scrollY;
          triggerPaymentFireworks();
          setPaymentConfirmation('Coupon applied successfully. Your subscription is now active, and a confirmation email has been sent to you.');
          void refreshUserProfile?.();
          requestAnimationFrame(() => {
            window.scrollTo({ top: currentScrollY, behavior: 'auto' });
          });
          setTimeout(() => {
            router.push('/profile');
          }, 2200);
          return;
        }
      }

      if (!razorpayKeyId) {
        alert('Razorpay public key is missing. Please contact support.');
        return;
      }

      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) {
        alert('Unable to load Razorpay checkout. Please try again.');
        return;
      }

      const orderRes = await fetch('/api/subscriptions/razorpay/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planType,
          interval: frequency,
          promoCode: appliedCoupon,
          useRbPoints,
        }),
      });

      const orderPayload = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderPayload?.success) {
        throw new Error(orderPayload?.message || 'Failed to create order');
      }

      const orderData = orderPayload.data;

      if (orderData?.requiresPayment === false) {
        const redeemRes = await fetch('/api/subscriptions/wallet/redeem', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            planType,
            interval: frequency,
            promoCode: appliedCoupon,
          }),
        });

        const redeemPayload = await redeemRes.json().catch(() => ({}));
        if (!redeemRes.ok || !redeemPayload?.success) {
          throw new Error(redeemPayload?.message || 'Failed to redeem RB points.');
        }

        const currentScrollY = window.scrollY;
        triggerPaymentFireworks();
        setPaymentConfirmation('RB points redeemed successfully. Your subscription is now active, and a confirmation email has been sent to you.');
        void refreshUserProfile?.();
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: 'auto' });
        });
        setTimeout(() => {
          router.push('/profile');
        }, 2200);
        return;
      }

      releaseBodyScrollLock = lockBodyScroll();

      const checkout = new (window as any).Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'ABjee Travel',
        description: `${orderData.planName} (${frequency})`,
        order_id: orderData.orderId,
        handler: async (response: any) => {
          if (releaseBodyScrollLock) {
            releaseBodyScrollLock();
            releaseBodyScrollLock = null;
          }

          try {
            const verifyRes = await fetch('/api/subscriptions/razorpay/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                ...response,
                planType,
                interval: frequency,
              }),
            });

            const verifyPayload = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok || !verifyPayload?.success) {
              throw new Error(verifyPayload?.message || 'Payment verification failed');
            }

            const currentScrollY = window.scrollY;
            triggerPaymentFireworks();
            setPaymentConfirmation('Payment confirmed successfully. Your subscription is now active, and a confirmation email has been sent to you.');
            requestAnimationFrame(() => {
              window.scrollTo({ top: currentScrollY, behavior: 'auto' });
            });
            setTimeout(() => {
              router.push('/profile');
            }, 2200);
          } catch (error: any) {
            alert(error?.message || 'Payment verification failed. Please contact support.');
          }
        },
        prefill: {
          name: userProfile?.displayName || '',
          email: userProfile?.email || currentUser.email || '',
        },
        theme: {
          color: '#e11d48',
        },
        modal: {
          ondismiss: () => {
            if (releaseBodyScrollLock) {
              releaseBodyScrollLock();
              releaseBodyScrollLock = null;
            }
            setProcessingPlan(null);
          },
        },
      });

      checkoutOpened = true;
      checkout.open();
    } catch (error: any) {
      if (releaseBodyScrollLock) {
        releaseBodyScrollLock();
        releaseBodyScrollLock = null;
      }
      alert(error?.message || 'Failed to start payment. Please try again.');
    } finally {
      if (!checkoutOpened && releaseBodyScrollLock) {
        releaseBodyScrollLock();
      }
      setProcessingPlan(null);
    }
  }, [appliedCoupon, currentUser, frequency, loadRazorpayScript, lockBodyScroll, razorpayKeyId, router, triggerPaymentFireworks, useRbPoints, userProfile?.displayName, userProfile?.email]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Try to load cached plans on mount for instant rendering
    try {
      const cached = localStorage.getItem('abjee:pricingPlans');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlans(parsed);
          setLoadingPlans(false);
        }
      }
    } catch (e) {
      console.warn('Failed to load cached pricing plans:', e);
    }

    const fetchPricingPlans = async () => {
      try {
        const res = await fetch('/api/subscriptions/plans');
        const payload = await res.json().catch(() => ({}));
        
        console.log('Pricing API Response:', payload);
        
        if (res.ok && payload?.success && payload?.data?.plans) {
          const plansData = payload.data.plans;
          const adminFeatures = payload?.data?.adminFeatures || {};
          
          // Map component plan IDs to API plan IDs
          const planIdMap: Record<string, string> = {
            hobby: 'free',
            pro: 'pro',
            enterprise: 'premium',
          };
          
          // Merge fetched pricing and features with default plan structure
          const updatedPlans = DEFAULT_PLANS.map((defaultPlan) => {
            const apiPlanId = planIdMap[defaultPlan.id];
            const fetchedPlan = plansData[apiPlanId];
            
            console.log(`Plan ${defaultPlan.id} (API: ${apiPlanId}):`, fetchedPlan);
            
            if (fetchedPlan && fetchedPlan.price && fetchedPlan.yearlyPrice) {
              // Get admin feature text for this plan
              const featureTextKey = defaultPlan.id === 'pro' ? 'proFeatures' : defaultPlan.id === 'enterprise' ? 'premiumFeatures' : null;
              const adminFeatureText = featureTextKey ? adminFeatures[featureTextKey] : null;
              
              const features = generateFeaturesFromApi(defaultPlan.id, fetchedPlan.features, adminFeatureText);
              console.log(`Generated features for ${defaultPlan.id}:`, features);
              
              return {
                ...defaultPlan,
                price: {
                  monthly: fetchedPlan.price.amount ?? defaultPlan.price.monthly,
                  yearly: fetchedPlan.yearlyPrice.amount ?? defaultPlan.price.yearly,
                },
                features,
              };
            }
            return defaultPlan;
          });
          
          console.log('Updated Plans:', updatedPlans);
          setPlans(updatedPlans);

          // Cache in localStorage for future instant rendering
          try {
            localStorage.setItem('abjee:pricingPlans', JSON.stringify(updatedPlans));
          } catch (e) {
            // ignore
          }
        }
      } catch (error) {
        console.error('Failed to fetch pricing plans:', error);
        // Keep using default plans if fetch fails
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPricingPlans();
  }, []);

  if (!mounted) return null;

  return (
    <div className="not-prose relative flex w-full flex-col gap-16 overflow-hidden px-4 py-24 text-center sm:px-8">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[10%] left-[50%] h-[40%] w-[60%] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="flex flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center space-y-2">
          <Badge
            variant="outline"
            className="mb-4 rounded-full border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium"
          >
            Pricing Plans
          </Badge>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-linear-to-b from-foreground to-foreground/30 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl"
          >
            Pick the perfect plan for your needs
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-md pt-2 text-lg text-muted-foreground"
          >
            Simple, transparent pricing that scales with your business. No
            hidden fees, no surprises.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Tabs
            defaultValue={frequency}
            onValueChange={setFrequency}
            className="inline-block rounded-full bg-muted/30 p-1 shadow-sm"
          >
            <TabsList className="bg-transparent">
              <TabsTrigger
                value="monthly"
                className="rounded-full transition-all duration-300 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Monthly
              </TabsTrigger>
              <TabsTrigger
                value="yearly"
                className="rounded-full transition-all duration-300 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Yearly
                <Badge
                  variant="secondary"
                  className="ml-2 bg-primary/10 text-primary hover:bg-primary/15"
                >
                  20% off
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="w-full max-w-2xl rounded-xl border border-primary/20 bg-card/70 p-4 text-left"
        >
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void validateCouponForCurrentFrequency(couponInput);
            }}
          >
            <div className="w-full space-y-1">
              <label className="text-sm font-medium">Have a coupon code?</label>
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
                className="uppercase"
              />
            </div>
            <div className="flex gap-2">
              <ConfettiButton
                type="submit"
                variant="default"
                options={{ origin: { x: 0.5, y: 0.5 } }}
                disabled={applyingCoupon}
              >
                {applyingCoupon ? 'Applying...' : 'Apply Coupon'}
              </ConfettiButton>
              {appliedCoupon && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAppliedCoupon(null);
                    setCouponPreviewByPlan({});
                    setCouponInput('');
                    setCouponError(null);
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </form>
          {appliedCoupon && (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
              Coupon {appliedCoupon} applied to eligible paid plans.
            </p>
          )}
          {couponError && (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{couponError}</p>
          )}
        </motion.div>

        {paymentConfirmation && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed left-1/2 top-24 z-120 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
          >
            {paymentConfirmation}
          </motion.div>
        )}

        {currentUser && walletSummary.usablePoints > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.28 }}
            className="w-full max-w-2xl rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-left"
          >
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={useRbPoints}
                onChange={(event) => setUseRbPoints(event.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-600"
              />
                <span>
                <span className="block font-medium text-foreground">Use ABjee Wallet Points</span>
                <span className="block text-muted-foreground">
                  Available discount: Rs {walletSummary.usablePoints}. 1 RB point = Rs 1. Monthly redemption cap: Rs {walletSummary.monthlyCap} (remaining this month: Rs {walletSummary.monthlyRemaining}). Unredeemed points stay in your wallet.
                </span>
              </span>
            </label>
          </motion.div>
        )}

        <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
              whileHover={{ y: -5 }}
              className="flex"
            >
              {(() => {
                const isCurrentPlan = Boolean(activePlanId && plan.id === activePlanId);
                const isFreePlan = plan.id === 'hobby';
                const isPremiumPlan = plan.id === 'enterprise';
                return (
              <Card
                className={cn(
                  'relative h-full w-full bg-secondary/20 text-left transition-all duration-300 hover:shadow-lg',
                  isCurrentPlan && 'border-amber-300/70 bg-linear-to-br from-amber-50/80 via-orange-50/70 to-yellow-50/70 shadow-[0_16px_40px_-20px_rgba(251,191,36,0.75)] ring-2 ring-amber-300/65 dark:border-amber-500/40 dark:from-amber-950/35 dark:via-orange-950/25 dark:to-yellow-950/25 dark:ring-amber-500/50',
                  isFreePlan && !isCurrentPlan && 'border-emerald-400/60 bg-linear-to-br from-emerald-500/10 via-emerald-500/5 to-transparent ring-1 ring-emerald-400/45 shadow-[0_0_22px_rgba(16,185,129,0.2)]',
                  isPremiumPlan && !isCurrentPlan && 'border-blue-400/60 bg-linear-to-br from-blue-500/10 via-blue-500/5 to-transparent ring-1 ring-blue-400/45 shadow-[0_0_22px_rgba(59,130,246,0.2)]',
                  plan.popular && !isCurrentPlan
                    ? 'shadow-md ring-2 ring-primary/50 dark:shadow-primary/10'
                    : !isCurrentPlan && 'hover:border-primary/30',
                  plan.popular && !isCurrentPlan &&
                    'bg-linear-to-b from-primary/3 to-transparent',
                )}
              >
                {isFreePlan && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10 rounded-lg border border-emerald-400/75"
                      animate={{
                        opacity: [0.35, 0.85, 0.35],
                        boxShadow: [
                          '0 0 0px rgba(16,185,129,0.2)',
                          '0 0 24px rgba(16,185,129,0.55)',
                          '0 0 0px rgba(16,185,129,0.2)',
                        ],
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="pointer-events-none absolute -inset-0.5 z-0 rounded-lg border border-emerald-300/40"
                      animate={{ opacity: [0.2, 0.55, 0.2] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                    />
                  </>
                )}
                {isPremiumPlan && !isCurrentPlan && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10 rounded-lg border border-blue-400/75"
                      animate={{
                        opacity: [0.35, 0.85, 0.35],
                        boxShadow: [
                          '0 0 0px rgba(59,130,246,0.2)',
                          '0 0 24px rgba(59,130,246,0.55)',
                          '0 0 0px rgba(59,130,246,0.2)',
                        ],
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="pointer-events-none absolute -inset-0.5 z-0 rounded-lg border border-blue-300/40"
                      animate={{ opacity: [0.2, 0.55, 0.2] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                    />
                  </>
                )}
                {plan.popular && !isCurrentPlan && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10 rounded-lg border border-primary/85"
                      animate={{
                        opacity: [0.45, 0.95, 0.45],
                        boxShadow: [
                          '0 0 0px rgba(225,29,72,0.25)',
                          '0 0 30px rgba(225,29,72,0.7)',
                          '0 0 0px rgba(225,29,72,0.25)',
                        ],
                      }}
                      transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="pointer-events-none absolute -inset-1 z-0 rounded-xl bg-primary/20 blur-xl"
                      animate={{ opacity: [0.1, 0.35, 0.1] }}
                      transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut', delay: 0.12 }}
                    />
                  </>
                )}
                {isCurrentPlan && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-amber-300/85 dark:border-amber-400/65"
                      animate={{
                        opacity: [0.45, 0.95, 0.45],
                        boxShadow: [
                          '0 0 0px rgba(251,191,36,0.25)',
                          '0 0 22px rgba(251,191,36,0.65)',
                          '0 0 0px rgba(251,191,36,0.25)',
                        ],
                      }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="pointer-events-none absolute -inset-0.5 z-0 rounded-lg border border-amber-200/70 dark:border-amber-500/45"
                      animate={{ opacity: [0.25, 0.65, 0.25] }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.25 }}
                    />
                  </>
                )}
                {isCurrentPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 + index * 0.06 }}
                    className="absolute -top-3 left-0 right-0 z-20 mx-auto w-fit"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Badge className="rounded-full border-0 bg-linear-to-r from-amber-500 via-orange-500 to-rose-500 px-4 py-1 text-white shadow-lg shadow-amber-500/30">
                        <Crown className="mr-1.5 h-3.5 w-3.5" />
                        Current Plan
                      </Badge>
                    </motion.div>
                  </motion.div>
                )}
                {plan.popular && !isCurrentPlan && (
                  <div className="absolute -top-3 left-0 right-0 mx-auto w-fit">
                    <Badge className="rounded-full bg-primary px-4 py-1 text-primary-foreground shadow-sm">
                      Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className={cn('pb-4', plan.popular && 'pt-8')}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        plan.popular
                          ? 'bg-primary/10 text-primary'
                          : 'bg-secondary text-foreground',
                      )}
                    >
                      {(() => {
                        const IconComponent = PLAN_ICONS[plan.id] || Star;
                        return <IconComponent className="h-4 w-4" />;
                      })()}
                    </div>
                    <CardTitle
                      className={cn(
                        'text-xl font-bold',
                        plan.popular && 'text-primary',
                      )}
                    >
                      {plan.name}
                    </CardTitle>
                  </div>
                  <CardDescription className="mt-3 space-y-2">
                    <p className="text-sm">{plan.description}</p>
                    <div className="pt-2">
                      {loadingPlans ? (
                        <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
                      ) : typeof plan.price[
                        frequency as keyof typeof plan.price
                      ] === 'number' ? (
                        <>
                          <div className="flex items-baseline">
                            <NumberFlow
                              className={cn(
                                'text-3xl font-bold',
                                plan.popular ? 'text-primary' : 'text-foreground',
                              )}
                              format={{
                                style: 'currency',
                                currency: 'INR',
                                maximumFractionDigits: 0,
                              }}
                              value={
                                getDiscountedPlanAmount(plan.id) as number
                              }
                            />
                            {(couponPreviewByPlan[plan.id] || (useRbPoints && walletSummary.usablePoints > 0 && getPlanType(plan.id))) && (
                              <span className="ml-2 text-sm text-muted-foreground line-through">
                                {new Intl.NumberFormat('en-IN', {
                                  style: 'currency',
                                  currency: couponPreviewByPlan[plan.id]?.currency || 'INR',
                                  maximumFractionDigits: 0,
                                }).format(plan.price[frequency as keyof typeof plan.price] as number)}
                              </span>
                            )}
                            <span className="ml-1 text-sm text-muted-foreground">
                              /month, billed {frequency}
                            </span>
                          </div>
                          {getRbDiscountForPlan(plan.id) > 0 && (
                            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                              Includes RB discount of Rs {getRbDiscountForPlan(plan.id)} (max Rs 30/month)
                            </p>
                          )}
                        </>
                      ) : (
                        <span
                          className={cn(
                            'text-2xl font-bold',
                            plan.popular ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {plan.price[frequency as keyof typeof plan.price]}
                        </span>
                      )}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 pb-6">
                  {plan.features.map((feature, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full',
                          plan.popular
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary text-secondary-foreground',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      <span
                        className={
                          plan.popular
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }
                      >
                        {feature}
                      </span>
                    </motion.div>
                  ))}
                </CardContent>
                <CardFooter>
                  <Button
                    variant={plan.popular ? 'default' : 'outline'}
                    className={cn(
                      'w-full font-medium transition-all duration-300',
                      isCurrentPlan && 'border-0 bg-linear-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-md shadow-amber-500/30 hover:brightness-110',
                      isFreePlan && 'border-emerald-400/65 bg-emerald-500/5 text-emerald-100 shadow-[0_0_14px_rgba(16,185,129,0.2)] hover:border-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-50',
                      plan.popular
                        ? 'bg-primary hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20'
                        : 'hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
                    )}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loadingPlans || processingPlan === plan.id || isCurrentPlan}
                  >
                    {processingPlan === plan.id ? 'Processing...' : isCurrentPlan ? 'You are subscribed' : plan.cta}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Button>
                </CardFooter>

                {/* Subtle gradient effects */}
                {plan.popular ? (
                  <>
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 rounded-b-lg bg-linear-to-t from-primary/5 to-transparent" />
                    <div className="pointer-events-none absolute inset-0 rounded-lg border border-primary/20" />
                  </>
                ) : (
                  <div className="pointer-events-none absolute inset-0 rounded-lg border border-transparent opacity-0 transition-opacity duration-300 hover:border-primary/10 hover:opacity-100" />
                )}
                {couponPreviewByPlan[plan.id] && (
                  <div className="absolute right-3 top-3">
                    <Badge variant="secondary" className="border border-emerald-400/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      -{couponPreviewByPlan[plan.id].discountPercent}%
                    </Badge>
                  </div>
                )}
              </Card>
                );
              })()}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
