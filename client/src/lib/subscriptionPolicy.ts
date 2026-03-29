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

const TRIAL_DAYS = 7;
const MONTHLY_PRIVATE_ROOM_LIMIT = 3;
const YEARLY_PRIVATE_ROOM_LIMIT = 10;
const TRIAL_PRIVATE_ROOM_LIMIT = 3;

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
  const subscription = getSubscriptionInfo(userProfile);
  if (hasPaidAccess(subscription)) {
    return { eligible: false, daysLeft: 0 };
  }

  const profile = (userProfile ?? {}) as Record<string, unknown>;
  const createdAt = parseMaybeDate(profile.createdAt);
  if (!createdAt) {
    return { eligible: false, daysLeft: 0 };
  }

  const elapsedMs = Date.now() - createdAt.getTime();
  const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
  const withinTrial = elapsedMs <= TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const hasRoomCapacity = privateRoomCount < TRIAL_PRIVATE_ROOM_LIMIT;

  return {
    eligible: withinTrial && hasRoomCapacity,
    daysLeft,
  };
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

  const trial = getFreePrivateTrialState(userProfile, privateRoomCount);
  if (!trial.eligible) {
    return {
      allowed: false,
      maxAllowed: TRIAL_PRIVATE_ROOM_LIMIT,
      reason: `Free members can only access public communities, or up to ${TRIAL_PRIVATE_ROOM_LIMIT} private communities during the 7-day trial.`,
    };
  }

  return {
    allowed: true,
    maxAllowed: TRIAL_PRIVATE_ROOM_LIMIT,
    reason: `Free trial active: up to ${TRIAL_PRIVATE_ROOM_LIMIT} private communities (create or join), ${trial.daysLeft} day${trial.daysLeft === 1 ? '' : 's'} left.`,
  };
};

export const getPrivateRoomCreateAllowance = (
  userProfile: unknown,
  privateRoomCount: number
): { allowed: boolean; maxAllowed: number; reason: string } => {
  return getPrivateRoomParticipationAllowance(userProfile, privateRoomCount);
};
