import { adminDb } from '@/lib/server/firebaseAdminFirestore';

type Interval = 'monthly' | 'yearly';

export type PaidPlanType = 'pro' | 'premium' | 'advertizer';

export type SubscriptionPlanConfig = {
  type: PaidPlanType;
  name: string;
  price: { amount: number; currency: string; interval: Interval };
  yearlyPrice: { amount: number; currency: string; interval: Interval };
};

export const SUBSCRIPTION_PLANS: Record<PaidPlanType, SubscriptionPlanConfig> = {
  pro: {
    type: 'pro',
    name: 'Paid Plan',
    price: { amount: 2, currency: 'INR', interval: 'monthly' },
    yearlyPrice: { amount: 15, currency: 'INR', interval: 'yearly' },
  },
  premium: {
    type: 'premium',
    name: 'Premium Plan',
    price: { amount: 2, currency: 'INR', interval: 'monthly' },
    yearlyPrice: { amount: 15, currency: 'INR', interval: 'yearly' },
  },
  advertizer: {
    type: 'advertizer',
    name: 'Advertizers',
    price: { amount: 1000, currency: 'INR', interval: 'monthly' },
    yearlyPrice: { amount: 10000, currency: 'INR', interval: 'yearly' },
  },
};

export const DEFAULT_PRIVATE_ROOM_LIMITS: Record<PaidPlanType, number> = {
  pro: 3,
  premium: 10,
  advertizer: 0,
};

const SETTINGS_COLLECTION = 'admin_settings';
const SETTINGS_DOC_ID = 'system';

const parseAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
};

const parseLimit = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

export const isValidPaidPlan = (value: unknown): value is PaidPlanType => {
  return value === 'pro' || value === 'premium' || value === 'advertizer';
};

export const isValidInterval = (value: unknown): value is Interval => {
  return value === 'monthly' || value === 'yearly';
};

export const getPlanByInterval = (planType: PaidPlanType, interval: Interval) => {
  const selected = SUBSCRIPTION_PLANS[planType];
  return interval === 'yearly' ? selected.yearlyPrice : selected.price;
};

export const getConfiguredSubscriptionPlans = async (): Promise<Record<PaidPlanType, SubscriptionPlanConfig>> => {
  try {
    const snapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const pricing = data.pricing && typeof data.pricing === 'object'
      ? (data.pricing as Record<string, unknown>)
      : {};

    const baseCurrencyRaw = typeof pricing.currency === 'string' ? pricing.currency.trim().toUpperCase() : '';
    const baseCurrency = baseCurrencyRaw || SUBSCRIPTION_PLANS.pro.price.currency;

    return {
      pro: {
        ...SUBSCRIPTION_PLANS.pro,
        price: {
          ...SUBSCRIPTION_PLANS.pro.price,
          amount: parseAmount(pricing.proMonthly, SUBSCRIPTION_PLANS.pro.price.amount),
          currency: baseCurrency,
        },
        yearlyPrice: {
          ...SUBSCRIPTION_PLANS.pro.yearlyPrice,
          amount: parseAmount(pricing.proYearly, SUBSCRIPTION_PLANS.pro.yearlyPrice.amount),
          currency: baseCurrency,
        },
      },
      premium: {
        ...SUBSCRIPTION_PLANS.premium,
        price: {
          ...SUBSCRIPTION_PLANS.premium.price,
          amount: parseAmount(pricing.premiumMonthly, SUBSCRIPTION_PLANS.premium.price.amount),
          currency: baseCurrency,
        },
        yearlyPrice: {
          ...SUBSCRIPTION_PLANS.premium.yearlyPrice,
          amount: parseAmount(pricing.premiumYearly, SUBSCRIPTION_PLANS.premium.yearlyPrice.amount),
          currency: baseCurrency,
        },
      },
      advertizer: {
        ...SUBSCRIPTION_PLANS.advertizer,
        price: {
          ...SUBSCRIPTION_PLANS.advertizer.price,
          amount: parseAmount(pricing.advertizerMonthly, SUBSCRIPTION_PLANS.advertizer.price.amount),
          currency: baseCurrency,
        },
        yearlyPrice: {
          ...SUBSCRIPTION_PLANS.advertizer.yearlyPrice,
          amount: parseAmount(pricing.advertizerYearly, SUBSCRIPTION_PLANS.advertizer.yearlyPrice.amount),
          currency: baseCurrency,
        },
      },
    };
  } catch {
    return SUBSCRIPTION_PLANS;
  }
};

export const getConfiguredPrivateRoomLimits = async (): Promise<Record<PaidPlanType, number>> => {
  try {
    const snapshot = await adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const limits = data.privateRoomLimits && typeof data.privateRoomLimits === 'object'
      ? (data.privateRoomLimits as Record<string, unknown>)
      : {};

    return {
      pro: parseLimit(limits.pro, DEFAULT_PRIVATE_ROOM_LIMITS.pro),
      premium: parseLimit(limits.premium, DEFAULT_PRIVATE_ROOM_LIMITS.premium),
    };
  } catch {
    return DEFAULT_PRIVATE_ROOM_LIMITS;
  }
};

export const getConfiguredPlanByInterval = async (planType: PaidPlanType, interval: Interval) => {
  const plans = await getConfiguredSubscriptionPlans();
  const selected = plans[planType];
  return interval === 'yearly' ? selected.yearlyPrice : selected.price;
};

export const getIntervalEndDate = (interval: Interval, start = new Date()) => {
  const endDate = new Date(start);
  if (interval === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }
  return endDate;
};
