export type BillingInterval = 'monthly' | 'yearly';

export interface UserSubscriptionInfo {
  type: string;
  isActive: boolean;
  interval: BillingInterval;
  startDate: Date | null;
  endDate: Date | null;
}

export interface FreePrivateTrialState {
  eligible: boolean;
  daysLeft: number;
}

const MONTHLY_PRIVATE_ROOM_LIMIT = 3;
const YEARLY_PRIVATE_ROOM_LIMIT = 10;

const parseMaybeDate = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object') {
    const candidate = value as { seconds?: unknown; toDate?: () => Date };

    if (typeof candidate.toDate === 'function') {
      const parsed = candidate.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof candidate.seconds === 'number') {
      const parsed = new Date(candidate.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
};

export const getSubscriptionInfo = (userProfile: unknown): UserSubscriptionInfo => {
  const profile = (userProfile ?? {}) as Record<string, unknown>;
  const rawSubscription = (profile.subscription ?? {}) as Record<string, unknown>;

  const type = typeof rawSubscription.type === 'string' ? rawSubscription.type.toLowerCase() : 'free';
  const isActive = Boolean(rawSubscription.isActive);
  const interval: BillingInterval = rawSubscription.interval === 'yearly' ? 'yearly' : 'monthly';

  return {
    type,
    isActive,
    interval,
    startDate: parseMaybeDate(rawSubscription.startDate),
    endDate: parseMaybeDate(rawSubscription.endDate),
  };
};

export const hasPaidAccess = (subscription: UserSubscriptionInfo): boolean => {
  if (!subscription.isActive) return false;
  if (subscription.type === 'free') return false;

  if (!subscription.endDate) return true;
  return subscription.endDate.getTime() > Date.now();
};

export const getPaidPrivateRoomLimit = (subscription: UserSubscriptionInfo): number => {
  if (!hasPaidAccess(subscription)) return 0;
  return subscription.interval === 'yearly' ? YEARLY_PRIVATE_ROOM_LIMIT : MONTHLY_PRIVATE_ROOM_LIMIT;
};

export const canJoinPrivateRoom = (subscription: UserSubscriptionInfo): boolean => {
  return hasPaidAccess(subscription);
};

export const getFreePrivateTrialState = (
  userProfile: unknown,
  privateRoomCount: number
): FreePrivateTrialState => {
  void userProfile;
  void privateRoomCount;
  // Private communities require paid subscription only.
  return { eligible: false, daysLeft: 0 };
};

export const getPrivateRoomParticipationAllowance = (
  userProfile: unknown,
  privateRoomCount: number
): { allowed: boolean; maxAllowed: number; reason: string } => {
  const subscription = getSubscriptionInfo(userProfile);

  if (hasPaidAccess(subscription)) {
    const maxAllowed = getPaidPrivateRoomLimit(subscription);
    const planName = subscription.interval === 'yearly' ? 'Yearly' : 'Monthly';

    if (privateRoomCount >= maxAllowed) {
      return {
        allowed: false,
        maxAllowed,
        reason: `${planName} plan allows up to ${maxAllowed} private communities (create or join).`,
      };
    }

    return {
      allowed: true,
      maxAllowed,
      reason: `${planName} paid member: up to ${maxAllowed} private communities (create or join).`,
    };
  }

  return {
    allowed: false,
    maxAllowed: 0,
    reason: 'Private communities require an active paid subscription.',
  };
};

export const getPrivateRoomCreateAllowance = (
  userProfile: unknown,
  privateRoomCount: number
): { allowed: boolean; maxAllowed: number; reason: string } => {
  return getPrivateRoomParticipationAllowance(userProfile, privateRoomCount);
};
