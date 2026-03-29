import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdmin';
import { subscriptionService } from '@/services/subscriptionService';
import { userService } from '@/services/userService';
import {
  getIntervalEndDate,
  getPlanByInterval,
  isValidInterval,
  isValidPaidPlan,
  SUBSCRIPTION_PLANS,
} from '@/lib/server/subscriptionPlans';

export const runtime = 'nodejs';

const getRazorpayAuth = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are missing');
  }

  return {
    keySecret,
    authHeader: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
  };
};

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));

    const razorpayOrderId = String(body.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(body.razorpay_payment_id || '').trim();
    const razorpaySignature = String(body.razorpay_signature || '').trim();
    const planType = body.planType;
    const interval = body.interval;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return fail('Missing payment verification fields', 400);
    }

    if (!isValidPaidPlan(planType) || !isValidInterval(interval)) {
      return fail('Invalid subscription details', 400);
    }

    const paymentDocRef = adminDb.collection('subscriptionPayments').doc(razorpayOrderId);
    const paymentDoc = await paymentDocRef.get();

    if (!paymentDoc.exists) {
      return fail('Order record not found', 404);
    }

    const paymentData = paymentDoc.data() as Record<string, any>;
    if (paymentData.userId !== user.id) {
      return fail('Order does not belong to current user', 403);
    }

    if (paymentData.planType !== planType || paymentData.interval !== interval) {
      return fail('Order payload mismatch', 400);
    }

    if (paymentData.status === 'paid') {
      return ok({ message: 'Payment already verified' });
    }

    const { keySecret, authHeader } = getRazorpayAuth();

    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return fail('Invalid Razorpay signature', 400);
    }

    const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpayPaymentId}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    const paymentDetails = await paymentRes.json().catch(() => ({}));

    if (!paymentRes.ok) {
      return fail('Unable to validate payment with Razorpay', 400);
    }

    const paymentStatus = String(paymentDetails?.status || '').toLowerCase();
    if (paymentStatus !== 'captured' && paymentStatus !== 'authorized') {
      return fail('Payment not completed', 400);
    }

    const selectedPlan = SUBSCRIPTION_PLANS[planType];
    const selectedPrice = getPlanByInterval(planType, interval);
    const startDate = new Date();
    const endDate = getIntervalEndDate(interval, startDate);

    let subscription = await subscriptionService.findByUserId(user.id);
    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: selectedPrice,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = interval === 'yearly' ? 10 : 3;

    const billingEntry = {
      amount: plan.price.amount,
      currency: plan.price.currency,
      status: 'paid',
      description: `${selectedPlan.name} - ${interval} subscription`,
      invoiceId: `INV-${Date.now()}`,
      paymentDate: new Date().toISOString(),
      paymentGateway: 'razorpay',
      razorpayOrderId,
      razorpayPaymentId,
    };

    if (!subscription) {
      subscription = await subscriptionService.create({
        user: user.id,
        plan,
        status: 'active',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        features,
        nextBillingDate: endDate.toISOString(),
        paymentMethod: {
          type: 'razorpay',
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
        },
        billingHistory: [billingEntry],
      });
    } else {
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
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
        },
        billingHistory: [...(subscription.billingHistory || []), billingEntry],
      });
    }

    await userService.update(user.id, {
      'subscription.type': planType,
      'subscription.isActive': true,
      'subscription.interval': interval,
      'subscription.startDate': startDate.toISOString(),
      'subscription.endDate': endDate.toISOString(),
    });

    await paymentDocRef.update({
      status: 'paid',
      razorpayPaymentId,
      razorpaySignature,
      razorpayPaymentStatus: paymentStatus,
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return ok({
      message: 'Payment verified and subscription activated',
      subscription,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to verify payment', 500);
  }
}
