import { admin, adminDb } from "@/lib/server/firebaseAdmin";

type AnyObj = Record<string, any>;
const COLLECTION = "subscriptions";

const createSubscriptionData = (data: AnyObj): AnyObj => ({
  user: data.user || null,
  plan: {
    type: data.plan?.type || "free",
    name: data.plan?.name || "Free Plan",
    price: {
      amount: data.plan?.price?.amount || 0,
      currency: data.plan?.price?.currency || "USD",
      interval: data.plan?.price?.interval || null,
    },
  },
  status: data.status || "active",
  startDate: data.startDate || admin.firestore.Timestamp.now(),
  endDate: data.endDate || null,
  trialEndDate: data.trialEndDate || null,
  paymentMethod: data.paymentMethod || { type: "free" },
  stripeCustomerId: data.stripeCustomerId || null,
  stripeSubscriptionId: data.stripeSubscriptionId || null,
  paypalSubscriptionId: data.paypalSubscriptionId || null,
  billingHistory: data.billingHistory || [],
  nextBillingDate: data.nextBillingDate || null,
  features: data.features || {
    privateChatAccess: false,
    maxPrivateChats: 0,
    travelPartnerRequests: 1,
    prioritySupport: false,
    advancedFilters: false,
    profileBoost: false,
    fileUploadLimit: 5,
    customDestinations: false,
  },
  usage: data.usage || {
    privateChatsUsed: 0,
    travelRequestsUsed: 0,
    lastResetDate: admin.firestore.Timestamp.now(),
  },
  cancellation: data.cancellation || null,
  autoRenew: data.autoRenew !== undefined ? data.autoRenew : true,
  promoCode: data.promoCode || null,
  createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

class SubscriptionService {
  private collection = adminDb.collection(COLLECTION);

  async create(subscriptionData: AnyObj) {
    const ref = this.collection.doc();
    const payload = createSubscriptionData(subscriptionData);
    payload.features = this.getFeaturesForPlan(payload.plan.type);
    await ref.set(payload);
    return { id: ref.id, ...payload };
  }

  async findById(id: string) {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Record<string, any>;
  }

  async findByUserId(userId: string) {
    const snapshot = await this.collection.where("user", "==", userId).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Record<string, any>;
  }

  async update(id: string, updateData: AnyObj) {
    await this.collection.doc(id).update({ ...updateData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return this.findById(id);
  }

  getFeaturesForPlan(planType: string) {
    const features: Record<string, AnyObj> = {
      free: {
        privateChatAccess: false,
        maxPrivateChats: 0,
        travelPartnerRequests: 1,
        prioritySupport: false,
        advancedFilters: false,
        profileBoost: false,
        fileUploadLimit: 5,
        customDestinations: false,
      },
      pro: {
        privateChatAccess: true,
        maxPrivateChats: 3,
        travelPartnerRequests: 5,
        prioritySupport: true,
        advancedFilters: true,
        profileBoost: false,
        fileUploadLimit: 25,
        customDestinations: true,
      },
      premium: {
        privateChatAccess: true,
        maxPrivateChats: 3,
        travelPartnerRequests: -1,
        prioritySupport: true,
        advancedFilters: true,
        profileBoost: true,
        fileUploadLimit: 100,
        customDestinations: true,
      },
    };

    return features[planType] || features.free;
  }

  isActive(subscription: AnyObj) {
    return subscription.status === "active" && (!subscription.endDate || new Date(subscription.endDate) > new Date());
  }

  async cancel(subscriptionId: string, reason: string, cancelAtPeriodEnd = true) {
    const updates: AnyObj = {
      cancellation: {
        cancelledAt: admin.firestore.Timestamp.now(),
        reason,
        cancelAtPeriodEnd,
      },
      autoRenew: false,
    };

    if (!cancelAtPeriodEnd) {
      updates.status = "cancelled";
      updates.endDate = admin.firestore.Timestamp.now();
    }

    await this.update(subscriptionId, updates);
    return this.findById(subscriptionId);
  }
}

export const subscriptionService = new SubscriptionService();
