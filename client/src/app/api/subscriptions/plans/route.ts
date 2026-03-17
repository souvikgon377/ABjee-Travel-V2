import { ok } from "@/lib/server/http";

export const runtime = "nodejs";

const SUBSCRIPTION_PLANS = {
  free: {
    type: "free",
    name: "Free Plan",
    price: { amount: 0, currency: "USD" },
    features: {
      privateChatAccess: false,
      maxPrivateChats: 0,
      travelPartnerRequests: 1,
      prioritySupport: false,
      advancedFilters: false,
      profileBoost: false,
      fileUploadLimit: 5,
      customDestinations: false,
    },
  },
  pro: {
    type: "pro",
    name: "Pro Plan",
    price: { amount: 90, currency: "USD", interval: "monthly" },
    yearlyPrice: { amount: 75, currency: "USD", interval: "yearly" },
    features: {
      privateChatAccess: true,
      maxPrivateChats: 10,
      travelPartnerRequests: 5,
      prioritySupport: true,
      advancedFilters: true,
      profileBoost: false,
      fileUploadLimit: 25,
      customDestinations: true,
    },
  },
  premium: {
    type: "premium",
    name: "Premium Plan",
    price: { amount: 150, currency: "USD", interval: "monthly" },
    yearlyPrice: { amount: 125, currency: "USD", interval: "yearly" },
    features: {
      privateChatAccess: true,
      maxPrivateChats: -1,
      travelPartnerRequests: -1,
      prioritySupport: true,
      advancedFilters: true,
      profileBoost: true,
      fileUploadLimit: 100,
      customDestinations: true,
    },
  },
};

export async function GET() {
  return ok({ plans: SUBSCRIPTION_PLANS });
}
