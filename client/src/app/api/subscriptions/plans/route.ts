import { ok } from '@/lib/server/http';
import {
  getConfiguredPrivateRoomLimits,
  getConfiguredSubscriptionPlans,
} from '@/lib/server/subscriptionPlans';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';

export const runtime = 'nodejs';

export async function GET() {
  const [configuredPlans, privateRoomLimits] = await Promise.all([
    getConfiguredSubscriptionPlans(),
    getConfiguredPrivateRoomLimits(),
  ]);

  // Fetch admin feature text
  let adminFeatures = { proFeatures: '', premiumFeatures: '', advertizerFeatures: '' };
  try {
    const snapshot = await adminDb.collection('admin_settings').doc('system').get();
    const data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const features = data.features && typeof data.features === 'object' ? (data.features as Record<string, any>) : {};
    adminFeatures = {
      proFeatures: typeof features.proFeatures === 'string' ? features.proFeatures : '',
      premiumFeatures: typeof features.premiumFeatures === 'string' ? features.premiumFeatures : '',
      advertizerFeatures: typeof features.advertizerFeatures === 'string' ? features.advertizerFeatures : '',
    };
  } catch (error) {
    console.error('Failed to fetch admin features:', error);
  }

  return ok({
    plans: {
      free: {
        type: 'free',
        name: 'Free Plan',
        price: { amount: 0, currency: configuredPlans.pro.price.currency },
        features: {
          privateChatAccess: false,
          maxPrivateChats: 0,
          maxPrivateChatsYearly: 0,
          travelPartnerRequests: 1,
          prioritySupport: false,
          advancedFilters: false,
          profileBoost: false,
          fileUploadLimit: 5,
          customDestinations: false,
        },
      },
      pro: {
        ...configuredPlans.pro,
        features: {
          privateChatAccess: true,
          maxPrivateChats: privateRoomLimits.pro,
          maxPrivateChatsYearly: privateRoomLimits.pro,
          travelPartnerRequests: 5,
          prioritySupport: true,
          advancedFilters: true,
          profileBoost: false,
          fileUploadLimit: 25,
          customDestinations: true,
        },
      },
      premium: {
        ...configuredPlans.premium,
        features: {
          privateChatAccess: true,
          maxPrivateChats: privateRoomLimits.premium,
          maxPrivateChatsYearly: privateRoomLimits.premium,
          travelPartnerRequests: -1,
          prioritySupport: true,
          advancedFilters: true,
          profileBoost: true,
          fileUploadLimit: 100,
          customDestinations: true,
        },
      },
      advertizer: {
        ...configuredPlans.advertizer,
        features: {
          privateChatAccess: false,
          maxPrivateChats: privateRoomLimits.advertizer || 0,
          maxPrivateChatsYearly: privateRoomLimits.advertizer || 0,
          travelPartnerRequests: 0,
          prioritySupport: true,
          advancedFilters: false,
          profileBoost: false,
          fileUploadLimit: 500,
          customDestinations: false,
        },
      },
    },
    adminFeatures,
  });
}
