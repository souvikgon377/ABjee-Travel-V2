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
import { Sparkles, ArrowRight, Check, Star, Zap, Shield } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { Input } from '@/components/ui/input';
import { ConfettiButton } from '@/components/ui/confetti';

const plans = [
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
    name: 'Paid',
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

export default function SimplePricing() {
  const [frequency, setFrequency] = useState<string>('monthly');
  const [mounted, setMounted] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [paymentConfirmation, setPaymentConfirmation] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPreviewByPlan, setCouponPreviewByPlan] = useState<Record<string, {
    discountPercent: number;
    discountAmount: number;
    finalAmount: number;
    currency: string;
  }>>({});
  const { currentUser, userProfile } = useAuth();
  const router = useRouter();

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
      router.push('/chat');
      return;
    }

    if (!currentUser || !auth.currentUser) {
      alert('Please login to continue with subscription.');
      router.push('/auth');
      return;
    }

    if (!razorpayKeyId) {
      alert('Razorpay public key is missing. Please contact support.');
      return;
    }

    setProcessingPlan(planId);
    let releaseBodyScrollLock: (() => void) | null = null;
    let checkoutOpened = false;

    try {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) {
        alert('Unable to load Razorpay checkout. Please try again.');
        return;
      }

      const token = await auth.currentUser.getIdToken();

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
        }),
      });

      const orderPayload = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderPayload?.success) {
        throw new Error(orderPayload?.message || 'Failed to create order');
      }

      const orderData = orderPayload.data;
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
            setPaymentConfirmation('Payment confirmed successfully. Your subscription is now active.');
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
  }, [currentUser, frequency, loadRazorpayScript, lockBodyScroll, razorpayKeyId, router, triggerPaymentFireworks, userProfile?.displayName, userProfile?.email]);

  useEffect(() => {
    setMounted(true);
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
            <Sparkles className="mr-1 h-3.5 w-3.5 animate-pulse text-primary" />
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
                type="button"
                variant="default"
                onClick={() => validateCouponForCurrentFrequency(couponInput)}
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
          </div>
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
              <Card
                className={cn(
                  'relative h-full w-full bg-secondary/20 text-left transition-all duration-300 hover:shadow-lg',
                  plan.popular
                    ? 'shadow-md ring-2 ring-primary/50 dark:shadow-primary/10'
                    : 'hover:border-primary/30',
                  plan.popular &&
                    'bg-linear-to-b from-primary/3 to-transparent',
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-0 right-0 mx-auto w-fit">
                    <Badge className="rounded-full bg-primary px-4 py-1 text-primary-foreground shadow-sm">
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
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
                      <plan.icon className="h-4 w-4" />
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
                      {typeof plan.price[
                        frequency as keyof typeof plan.price
                      ] === 'number' ? (
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
                              (couponPreviewByPlan[plan.id]?.finalAmount ??
                                (plan.price[
                                  frequency as keyof typeof plan.price
                                ] as number))
                            }
                          />
                          {couponPreviewByPlan[plan.id] && (
                            <span className="ml-2 text-sm text-muted-foreground line-through">
                              {new Intl.NumberFormat('en-IN', {
                                style: 'currency',
                                currency: couponPreviewByPlan[plan.id].currency,
                                maximumFractionDigits: 0,
                              }).format(plan.price[frequency as keyof typeof plan.price] as number)}
                            </span>
                          )}
                          <span className="ml-1 text-sm text-muted-foreground">
                            /month, billed {frequency}
                          </span>
                        </div>
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
                      plan.popular
                        ? 'bg-primary hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20'
                        : 'hover:border-primary/30 hover:bg-primary/5 hover:text-primary',
                    )}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={processingPlan === plan.id}
                  >
                    {processingPlan === plan.id ? 'Processing...' : plan.cta}
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
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}