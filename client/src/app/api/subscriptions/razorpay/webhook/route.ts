import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { subscriptionService } from '@/services/subscriptionService';
import { userService } from '@/services/userService';
import {
  getIntervalEndDate,
  getPlanByInterval,
  SUBSCRIPTION_PLANS,
  isValidInterval,
  isValidPaidPlan,
} from '@/lib/server/subscriptionPlans';

export const runtime = 'nodejs';

const getWebhookSecret = () => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Razorpay webhook secret is missing');
  }
  return secret;
};

const isHandledEvent = (eventName: string) => {
  return eventName === 'payment.captured' || eventName === 'payment.authorized' || eventName === 'order.paid';
};

const extractOrderId = (payload: Record<string, any>): string => {
  const paymentOrderId = String(payload?.payload?.payment?.entity?.order_id || '').trim();
  if (paymentOrderId) return paymentOrderId;

  const orderEntityId = String(payload?.payload?.order?.entity?.id || '').trim();
  if (orderEntityId) return orderEntityId;

  return '';
};

const extractPaymentStatus = (payload: Record<string, any>): string => {
  return String(payload?.payload?.payment?.entity?.status || '').toLowerCase();
};

const extractPaymentId = (payload: Record<string, any>): string => {
  return String(payload?.payload?.payment?.entity?.id || '').trim();
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    if (!signature) {
      return fail('Missing Razorpay signature header', 400);
    }

    const webhookSecret = getWebhookSecret();
    const expectedSignature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    if (expectedSignature !== signature) {
      return fail('Invalid webhook signature', 400);
    }

    const payload = JSON.parse(rawBody || '{}') as Record<string, any>;
    const eventName = String(payload?.event || '').trim();

    if (!eventName) {
      return fail('Missing event name', 400);
    }

    if (!isHandledEvent(eventName)) {
      return ok({ message: `Event ignored: ${eventName}` });
    }

    const orderId = extractOrderId(payload);
    if (!orderId) {
      return fail('Missing Razorpay order id in webhook payload', 400);
    }

    const paymentDocRef = adminDb.collection('subscriptionPayments').doc(orderId);
    const paymentDoc = await paymentDocRef.get();

    if (!paymentDoc.exists) {
      return fail('Order record not found', 404);
    }

    const paymentData = paymentDoc.data() as Record<string, any>;
    const userId = String(paymentData.userId || '').trim();
    const planType = String(paymentData.planType || '').trim();
    const interval = String(paymentData.interval || '').trim();

    if (!userId) {
      return fail('Order missing user id', 400);
    }

    if (!isValidPaidPlan(planType) || !isValidInterval(interval)) {
      return fail('Order has invalid plan details', 400);
    }

    const paymentStatus = extractPaymentStatus(payload);
    const paymentId = extractPaymentId(payload);

    if (paymentStatus !== 'captured' && paymentStatus !== 'authorized') {
      await paymentDocRef.update({
        status: paymentStatus || 'failed',
        razorpayPaymentId: paymentId || null,
        razorpayWebhookEvent: eventName,
        updatedAt: new Date().toISOString(),
      });
      return ok({ message: `Payment status ${paymentStatus || 'unknown'} recorded` });
    }

    const selectedPlan = SUBSCRIPTION_PLANS[planType];
    const selectedPrice = getPlanByInterval(planType, interval);
    const appliedPromoCode = typeof paymentData.promoCode === 'string' ? paymentData.promoCode : null;
    const discountPercent = Number(paymentData.discountPercent || 0);
    const discountAmount = Number(paymentData.discountAmount || 0);
    const finalAmount = Number(paymentData.amount || selectedPrice.amount);

    const startDate = new Date();
    const endDate = getIntervalEndDate(interval, startDate);

    let subscription = await subscriptionService.findByUserId(userId);

    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: selectedPrice,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = interval === 'yearly' ? 10 : 3;

    const billingEntry = {
      amount: finalAmount,
      currency: plan.price.currency,
      status: 'paid',
      description: `${selectedPlan.name} - ${interval} subscription`,
      invoiceId: `INV-${Date.now()}`,
      paymentDate: new Date().toISOString(),
      paymentGateway: 'razorpay',
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      promoCode: appliedPromoCode,
      discountPercent,
      discountAmount,
      source: 'webhook',
    };

    if (!subscription) {
      subscription = await subscriptionService.create({
        user: userId,
        plan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        paymentMethod: {
          type: 'razorpay',
          orderId,
          paymentId,
        },
        promoCode: appliedPromoCode,
        billingHistory: [billingEntry],
      });
    } else {
      const hasThisPaymentInHistory = Array.isArray(subscription.billingHistory)
        ? subscription.billingHistory.some((entry: Record<string, any>) => entry?.razorpayOrderId === orderId)
        : false;

      subscription = await subscriptionService.update(subscription.id, {
        plan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        autoRenew: true,
        cancellation: null,
        paymentMethod: {
          type: 'razorpay',
          orderId,
          paymentId,
        },
        promoCode: appliedPromoCode,
        billingHistory: hasThisPaymentInHistory
          ? subscription.billingHistory || []
          : [...(subscription.billingHistory || []), billingEntry],
      });
    }

    await userService.update(userId, {
      'subscription.type': planType,
      'subscription.isActive': true,
      'subscription.interval': interval,
      'subscription.startDate': startDate.toISOString(),
      'subscription.endDate': endDate.toISOString(),
    });

    await paymentDocRef.update({
      status: 'paid',
      razorpayPaymentId: paymentId || null,
      razorpayPaymentStatus: paymentStatus,
      razorpayWebhookEvent: eventName,
      razorpayWebhookReceivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return ok({ message: 'Webhook processed successfully', subscriptionId: subscription?.id || null });
  } catch (error: any) {
    return fail(error?.message || 'Failed to process Razorpay webhook', 500);
  }
}
