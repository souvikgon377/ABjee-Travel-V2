import { FieldValue, adminDb } from "@/lib/server/firebaseAdminFirestore";

type AnyObject = Record<string, any>;

export const REBATE_POINT_VALUE_IN_RUPEES = 1;
export const REBATE_MONTHLY_REDEMPTION_LIMIT = 30;

export type WalletState = {
  availablePoints: number;
  lifetimeEarnedPoints: number;
  lifetimeRedeemedPoints: number;
  lifetimeRedeemedRupees: number;
  monthly: {
    monthKey: string;
    redeemedPoints: number;
    redeemedRupees: number;
    monthlyCapRupees: number;
  };
  updatedAt: unknown;
};

export type ReviewRebateBreakdown = {
  textPoints: number;
  mediaPoints: number;
  totalPoints: number;
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getWalletMonthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const createDefaultWalletState = (monthKey = getWalletMonthKey()): WalletState => ({
  availablePoints: 0,
  lifetimeEarnedPoints: 0,
  lifetimeRedeemedPoints: 0,
  lifetimeRedeemedRupees: 0,
  monthly: {
    monthKey,
    redeemedPoints: 0,
    redeemedRupees: 0,
    monthlyCapRupees: REBATE_MONTHLY_REDEMPTION_LIMIT,
  },
  updatedAt: FieldValue.serverTimestamp(),
});

export const normalizeWalletState = (value: unknown): WalletState => {
  const raw = (value && typeof value === "object" ? value : {}) as AnyObject;
  const monthlyRaw = (raw.monthly && typeof raw.monthly === "object" ? raw.monthly : {}) as AnyObject;

  return {
    availablePoints: Math.max(0, Math.floor(toFiniteNumber(raw.availablePoints))),
    lifetimeEarnedPoints: Math.max(0, Math.floor(toFiniteNumber(raw.lifetimeEarnedPoints))),
    lifetimeRedeemedPoints: Math.max(0, Math.floor(toFiniteNumber(raw.lifetimeRedeemedPoints))),
    lifetimeRedeemedRupees: Math.max(0, Math.floor(toFiniteNumber(raw.lifetimeRedeemedRupees))),
    monthly: {
      monthKey: typeof monthlyRaw.monthKey === "string" && monthlyRaw.monthKey ? monthlyRaw.monthKey : getWalletMonthKey(),
      redeemedPoints: Math.max(0, Math.floor(toFiniteNumber(monthlyRaw.redeemedPoints))),
      redeemedRupees: Math.max(0, Math.floor(toFiniteNumber(monthlyRaw.redeemedRupees))),
      monthlyCapRupees: Math.max(0, Math.floor(toFiniteNumber(monthlyRaw.monthlyCapRupees, REBATE_MONTHLY_REDEMPTION_LIMIT))),
    },
    updatedAt: raw.updatedAt ?? null,
  };
};

const isPaidSubscription = (subscription: AnyObject | null | undefined) => {
  if (!subscription || typeof subscription !== "object") return false;
  const type = typeof subscription.type === "string" ? subscription.type.toLowerCase() : "free";
  if (type === "free") return false;

  const isActive = Boolean(subscription.isActive);
  if (!isActive) return false;

  const endDate = subscription.endDate ? new Date(subscription.endDate) : null;
  if (endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= Date.now()) return false;

  return type === "pro" || type === "premium";
};

const getSubscriptionTier = (subscription: AnyObject | null | undefined): "free" | "pro" | "premium" => {
  if (!isPaidSubscription(subscription)) return "free";
  const type = typeof subscription?.type === "string" ? subscription.type.toLowerCase() : "free";
  return type === "premium" ? "premium" : "pro";
};

export const calculateReviewRebate = (input: { subscription?: AnyObject | null; text?: string; mediaCount?: number }): ReviewRebateBreakdown => {
  const tier = getSubscriptionTier(input.subscription);
  const hasText = String(input.text ?? "").trim().length > 0;
  const hasMedia = Math.max(0, Math.floor(toFiniteNumber(input.mediaCount))) > 0;

  const textPoints = hasText ? (tier === "free" ? 1 : 2) : 0;
  const mediaPoints = hasMedia ? (tier === "free" ? 1 : 3) : 0;

  return {
    textPoints,
    mediaPoints,
    totalPoints: textPoints + mediaPoints,
  };
};

const hydrateWalletForMonth = (wallet: WalletState) => {
  const currentMonthKey = getWalletMonthKey();
  if (wallet.monthly.monthKey === currentMonthKey) return wallet;
  return {
    ...wallet,
    monthly: {
      monthKey: currentMonthKey,
      redeemedPoints: 0,
      redeemedRupees: 0,
      monthlyCapRupees: REBATE_MONTHLY_REDEMPTION_LIMIT,
    },
  };
};

export const awardReviewRebate = async (input: {
  userId: string;
  placeId: string;
  reviewData: {
    text: string;
    rating: number;
    media: unknown[];
    author: string;
    userId: string;
    createdAt: Date;
  };
}) => {
  const userRef = adminDb.collection("users").doc(input.userId);
  const reviewRef = adminDb.collection("touristPlaces").doc(input.placeId).collection("reviews").doc();
  const walletTransactionRef = userRef.collection("walletTransactions").doc();

  const result = await adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new Error("User profile not found.");
    }

    const userData = userSnap.data() as AnyObject;
    const wallet = hydrateWalletForMonth(normalizeWalletState(userData.wallet));
    const ABJee = calculateReviewRebate({
      subscription: userData.subscription as AnyObject | undefined,
      text: input.reviewData.text,
      mediaCount: Array.isArray(input.reviewData.media) ? input.reviewData.media.length : 0,
    });

    transaction.set(reviewRef, {
      ...input.reviewData,
      ABJee,
      walletReward: {
        points: ABJee.totalPoints,
        valueInRupees: ABJee.totalPoints * REBATE_POINT_VALUE_IN_RUPEES,
        awardedAt: FieldValue.serverTimestamp(),
      },
    });

    const updatedWallet: WalletState = {
      availablePoints: wallet.availablePoints + ABJee.totalPoints,
      lifetimeEarnedPoints: wallet.lifetimeEarnedPoints + ABJee.totalPoints,
      lifetimeRedeemedPoints: wallet.lifetimeRedeemedPoints,
      lifetimeRedeemedRupees: wallet.lifetimeRedeemedRupees,
      monthly: wallet.monthly,
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(userRef, { wallet: updatedWallet, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    if (ABJee.totalPoints > 0) {
      transaction.set(walletTransactionRef, {
        type: "review_rebate",
        placeId: input.placeId,
        reviewId: reviewRef.id,
        points: ABJee.totalPoints,
        rupees: ABJee.totalPoints * REBATE_POINT_VALUE_IN_RUPEES,
        textPoints: ABJee.textPoints,
        mediaPoints: ABJee.mediaPoints,
        monthKey: wallet.monthly.monthKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      reviewId: reviewRef.id,
      ABJee,
      wallet: updatedWallet,
    };
  });

  return result;
};

export const reverseReviewRebate = async (input: {
  userId: string;
  placeId: string;
  reviewId: string;
}) => {
  const userRef = adminDb.collection("users").doc(input.userId);
  const reviewRef = adminDb.collection("touristPlaces").doc(input.placeId).collection("reviews").doc(input.reviewId);
  const walletTransactionRef = userRef.collection("walletTransactions").doc();

  return adminDb.runTransaction(async (transaction) => {
    const [userSnap, reviewSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(reviewRef),
    ]);

    if (!reviewSnap.exists) {
      throw new Error("Review not found.");
    }

    const reviewData = reviewSnap.data() as AnyObject;
    const walletReward = (reviewData.walletReward && typeof reviewData.walletReward === "object" ? reviewData.walletReward : {}) as AnyObject;
    const rebate = (reviewData.ABJee && typeof reviewData.ABJee === "object" ? reviewData.ABJee : {}) as AnyObject;
    const pointsToReverse = Math.max(0, Math.floor(toFiniteNumber(walletReward.points, toFiniteNumber(rebate.totalPoints))));
    const textPoints = Math.max(0, Math.floor(toFiniteNumber(rebate.textPoints)));
    const mediaPoints = Math.max(0, Math.floor(toFiniteNumber(rebate.mediaPoints)));

    transaction.delete(reviewRef);

    if (!userSnap.exists || pointsToReverse <= 0) {
      return { reversedPoints: 0, wallet: null };
    }

    const userData = userSnap.data() as AnyObject;
    const wallet = hydrateWalletForMonth(normalizeWalletState(userData.wallet));
    const updatedWallet: WalletState = {
      availablePoints: Math.max(0, wallet.availablePoints - pointsToReverse),
      lifetimeEarnedPoints: Math.max(0, wallet.lifetimeEarnedPoints - pointsToReverse),
      lifetimeRedeemedPoints: wallet.lifetimeRedeemedPoints,
      lifetimeRedeemedRupees: wallet.lifetimeRedeemedRupees,
      monthly: wallet.monthly,
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(userRef, { wallet: updatedWallet, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(walletTransactionRef, {
      type: "review_rebate_reversal",
      placeId: input.placeId,
      reviewId: input.reviewId,
      points: -pointsToReverse,
      rupees: -(pointsToReverse * REBATE_POINT_VALUE_IN_RUPEES),
      textPoints,
      mediaPoints,
      monthKey: wallet.monthly.monthKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { reversedPoints: pointsToReverse, wallet: updatedWallet };
  });
};

export const redeemWalletBalance = async (input: { userId: string; amount: number }) => {
  const userRef = adminDb.collection("users").doc(input.userId);
  const walletTransactionRef = userRef.collection("walletTransactions").doc();
  const requestedAmount = Math.max(1, Math.floor(toFiniteNumber(input.amount)));

  return adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new Error("User profile not found.");
    }

    const userData = userSnap.data() as AnyObject;
    const currentWallet = hydrateWalletForMonth(normalizeWalletState(userData.wallet));
    const monthlyRemaining = Math.max(0, REBATE_MONTHLY_REDEMPTION_LIMIT - currentWallet.monthly.redeemedRupees);
    const redeemable = Math.min(requestedAmount, currentWallet.availablePoints, monthlyRemaining);

    if (redeemable <= 0) {
      throw new Error("No ABJee balance is available for redemption this month.");
    }

    const updatedWallet: WalletState = {
      availablePoints: currentWallet.availablePoints - redeemable,
      lifetimeEarnedPoints: currentWallet.lifetimeEarnedPoints,
      lifetimeRedeemedPoints: currentWallet.lifetimeRedeemedPoints + redeemable,
      lifetimeRedeemedRupees: currentWallet.lifetimeRedeemedRupees + redeemable,
      monthly: {
        ...currentWallet.monthly,
        redeemedPoints: currentWallet.monthly.redeemedPoints + redeemable,
        redeemedRupees: currentWallet.monthly.redeemedRupees + redeemable,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(userRef, { wallet: updatedWallet, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(walletTransactionRef, {
      type: "wallet_redemption",
      points: redeemable,
      rupees: redeemable,
      requestedAmount,
      monthlyLimitRupees: REBATE_MONTHLY_REDEMPTION_LIMIT,
      monthKey: updatedWallet.monthly.monthKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      redeemedAmount: redeemable,
      wallet: updatedWallet,
      remainingThisMonth: Math.max(0, REBATE_MONTHLY_REDEMPTION_LIMIT - updatedWallet.monthly.redeemedRupees),
    };
  });
};

export const getWalletRedemptionPreview = async (input: { userId: string; amount: number }) => {
  const requestedAmount = Math.max(0, Math.floor(toFiniteNumber(input.amount)));
  if (requestedAmount <= 0) {
    return {
      redeemableAmount: 0,
      wallet: createDefaultWalletState(),
      remainingThisMonth: REBATE_MONTHLY_REDEMPTION_LIMIT,
    };
  }

  const userSnap = await adminDb.collection("users").doc(input.userId).get();
  if (!userSnap.exists) {
    throw new Error("User profile not found.");
  }

  const userData = userSnap.data() as AnyObject;
  const wallet = hydrateWalletForMonth(normalizeWalletState(userData.wallet));
  const monthlyRemaining = Math.max(0, REBATE_MONTHLY_REDEMPTION_LIMIT - wallet.monthly.redeemedRupees);
  const redeemableAmount = Math.min(requestedAmount, wallet.availablePoints, monthlyRemaining);

  return {
    redeemableAmount,
    wallet,
    remainingThisMonth: monthlyRemaining,
  };
};

export const redeemWalletForSubscription = async (input: {
  userId: string;
  amount: number;
  orderId?: string | null;
  paymentId?: string | null;
  planType?: string | null;
  interval?: string | null;
}) => {
  const userRef = adminDb.collection("users").doc(input.userId);
  const walletTransactionRef = userRef.collection("walletTransactions").doc();
  const requestedAmount = Math.max(0, Math.floor(toFiniteNumber(input.amount)));

  if (requestedAmount <= 0) {
    return { redeemedAmount: 0, wallet: null, remainingThisMonth: REBATE_MONTHLY_REDEMPTION_LIMIT };
  }

  return adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new Error("User profile not found.");
    }

    const userData = userSnap.data() as AnyObject;
    const currentWallet = hydrateWalletForMonth(normalizeWalletState(userData.wallet));
    const monthlyRemaining = Math.max(0, REBATE_MONTHLY_REDEMPTION_LIMIT - currentWallet.monthly.redeemedRupees);
    const redeemable = Math.min(requestedAmount, currentWallet.availablePoints, monthlyRemaining);

    if (redeemable < requestedAmount) {
      throw new Error("Available RB points changed. Please restart checkout.");
    }

    const updatedWallet: WalletState = {
      availablePoints: currentWallet.availablePoints - redeemable,
      lifetimeEarnedPoints: currentWallet.lifetimeEarnedPoints,
      lifetimeRedeemedPoints: currentWallet.lifetimeRedeemedPoints + redeemable,
      lifetimeRedeemedRupees: currentWallet.lifetimeRedeemedRupees + redeemable,
      monthly: {
        ...currentWallet.monthly,
        redeemedPoints: currentWallet.monthly.redeemedPoints + redeemable,
        redeemedRupees: currentWallet.monthly.redeemedRupees + redeemable,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(userRef, { wallet: updatedWallet, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(walletTransactionRef, {
      type: "subscription_wallet_redemption",
      points: redeemable,
      rupees: redeemable,
      requestedAmount,
      orderId: input.orderId || null,
      paymentId: input.paymentId || null,
      planType: input.planType || null,
      interval: input.interval || null,
      monthlyLimitRupees: REBATE_MONTHLY_REDEMPTION_LIMIT,
      monthKey: updatedWallet.monthly.monthKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      redeemedAmount: redeemable,
      wallet: updatedWallet,
      remainingThisMonth: Math.max(0, REBATE_MONTHLY_REDEMPTION_LIMIT - updatedWallet.monthly.redeemedRupees),
    };
  });
};
