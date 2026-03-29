type Interval = 'monthly' | 'yearly';

export type PaidPlanType = 'pro' | 'premium';

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
};

export const isValidPaidPlan = (value: unknown): value is PaidPlanType => {
  return value === 'pro' || value === 'premium';
};

export const isValidInterval = (value: unknown): value is Interval => {
  return value === 'monthly' || value === 'yearly';
};

export const getPlanByInterval = (planType: PaidPlanType, interval: Interval) => {
  const selected = SUBSCRIPTION_PLANS[planType];
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
