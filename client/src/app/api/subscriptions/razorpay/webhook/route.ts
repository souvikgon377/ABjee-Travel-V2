import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { invalidateUserProfileCache } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { subscriptionService } from '@/services/subscriptionService';
import { userService } from '@/services/userService';
import {
  getConfiguredPlanByInterval,
  getConfiguredPrivateRoomLimits,
  getConfiguredSubscriptionPlans,
  getIntervalEndDate,
  isValidInterval,
  isValidPaidPlan,
} from '@/lib/server/subscriptionPlans';
import { redeemWalletForSubscription } from '@/lib/server/rebateWallet';
import { sendEmail } from '@/lib/server/mail';

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

    // Log webhook receipt (for debugging)
    console.log('[Razorpay Webhook] Event received at', new Date().toISOString());
    console.log('[Razorpay Webhook] Signature header present:', !!signature);

    if (!signature) {
      console.error('[Razorpay Webhook] ERROR: Missing signature header');
      return fail('Missing Razorpay signature header', 400);
    }

    const webhookSecret = getWebhookSecret();
    const expectedSignature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    if (expectedSignature !== signature) {
      console.error('[Razorpay Webhook] ERROR: Signature mismatch');
      console.error('[Razorpay Webhook] Expected:', expectedSignature.substring(0, 16) + '...');
      console.error('[Razorpay Webhook] Got:', signature.substring(0, 16) + '...');
      return fail('Invalid webhook signature', 400);
    }

    const payload = JSON.parse(rawBody || '{}') as Record<string, any>;
    const eventName = String(payload?.event || '').trim();

    // Log parsed payload details
    console.log('[Razorpay Webhook] Event name:', eventName);
    console.log('[Razorpay Webhook] Payload ID:', payload?.id);
    console.log('[Razorpay Webhook] Full payload:', JSON.stringify(payload, null, 2));

    if (!eventName) {
      console.error('[Razorpay Webhook] ERROR: Missing event name in payload');
      return fail('Missing event name', 400);
    }

    if (!isHandledEvent(eventName)) {
      console.log('[Razorpay Webhook] Ignored event type:', eventName);
      return ok({ message: `Event ignored: ${eventName}` });
    }

    const orderId = extractOrderId(payload);
    if (!orderId) {
      console.error('[Razorpay Webhook] ERROR: Could not extract order ID from payload');
      console.error('[Razorpay Webhook] Checked paths:');
      console.error('  - payload.payload.payment.entity.order_id:', payload?.payload?.payment?.entity?.order_id);
      console.error('  - payload.payload.order.entity.id:', payload?.payload?.order?.entity?.id);
      return fail('Missing Razorpay order id in webhook payload', 400);
    }

    console.log('[Razorpay Webhook] Order ID extracted:', orderId);

    const paymentDocRef = adminDb.collection('subscriptionPayments').doc(orderId);
    const paymentDoc = await paymentDocRef.get();

    if (!paymentDoc.exists) {
      console.error('[Razorpay Webhook] ERROR: Order not found in subscriptionPayments');
      console.error('[Razorpay Webhook] Looking for order ID:', orderId);
      return fail('Order record not found', 404);
    }

    const paymentData = paymentDoc.data() as Record<string, any>;
    if (paymentData.status === 'paid') {
      return ok({ message: 'Payment already processed' });
    }
    const userId = String(paymentData.userId || '').trim();
    const planType = String(paymentData.planType || '').trim();
    const interval = String(paymentData.interval || '').trim();

    console.log('[Razorpay Webhook] Order details:', {
      orderId,
      userId,
      planType,
      interval,
      currentStatus: paymentData.status,
      amount: paymentData.amount,
    });

    if (!userId) {
      console.error('[Razorpay Webhook] ERROR: Order missing user ID');
      return fail('Order missing user id', 400);
    }

    if (!isValidPaidPlan(planType) || !isValidInterval(interval)) {
      console.error('[Razorpay Webhook] ERROR: Invalid plan details');
      console.error('[Razorpay Webhook] Plan type:', planType, 'Valid:', isValidPaidPlan(planType));
      console.error('[Razorpay Webhook] Interval:', interval, 'Valid:', isValidInterval(interval));
      return fail('Order has invalid plan details', 400);
    }

    const paymentStatus = extractPaymentStatus(payload);
    const paymentId = extractPaymentId(payload);

    console.log('[Razorpay Webhook] Payment details extracted:', {
      paymentId,
      paymentStatus,
      method: payload?.payload?.payment?.entity?.method,
      email: payload?.payload?.payment?.entity?.email,
    });

    if (paymentStatus !== 'captured' && paymentStatus !== 'authorized') {
      console.log('[Razorpay Webhook] Payment not captured/authorized. Status:', paymentStatus);
      await paymentDocRef.update({
        status: paymentStatus || 'failed',
        razorpayPaymentId: paymentId || null,
        razorpayWebhookEvent: eventName,
        updatedAt: new Date().toISOString(),
      });
      console.log('[Razorpay Webhook] Updated payment status to:', paymentStatus || 'failed');
      return ok({ message: `Payment status ${paymentStatus || 'unknown'} recorded` });
    }

    const [configuredPlans, privateRoomLimits, selectedPrice] = await Promise.all([
      getConfiguredSubscriptionPlans(),
      getConfiguredPrivateRoomLimits(),
      getConfiguredPlanByInterval(planType, interval),
    ]);
    const selectedPlan = configuredPlans[planType];
    const appliedPromoCode = typeof paymentData.promoCode === 'string' ? paymentData.promoCode : null;
    const discountPercent = Number(paymentData.discountPercent || 0);
    const discountAmount = Number(paymentData.discountAmount || 0);
    const rbPointsRedeemed = Math.max(0, Math.floor(Number(paymentData.rbPointsRedeemed || 0)));
    const rbDiscountAmount = Math.max(0, Number(paymentData.rbDiscountAmount || 0));
    const finalAmount = Number(paymentData.amount || selectedPrice.amount);

    console.log('[Razorpay Webhook] Pricing details:', {
      selectedPrice,
      appliedPromoCode,
      discountPercent,
      discountAmount,
      finalAmount,
    });

    const startDate = new Date();
    const endDate = getIntervalEndDate(interval, startDate);

    let subscription = await subscriptionService.findByUserId(userId);
    console.log('[Razorpay Webhook] Existing subscription found:', !!subscription);

    const plan = {
      type: planType,
      name: selectedPlan.name,
      price: selectedPrice,
    };

    const features = subscriptionService.getFeaturesForPlan(planType);
    features.maxPrivateChats = privateRoomLimits[planType];

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
      rbPointsRedeemed,
      rbDiscountAmount,
      source: 'webhook',
    };

    console.log('[Razorpay Webhook] Creating billing entry:', {
      invoiceId: billingEntry.invoiceId,
      amount: billingEntry.amount,
      currency: billingEntry.currency,
    });

    if (!subscription) {
      console.log('[Razorpay Webhook] Creating new subscription for user:', userId);
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
      console.log('[Razorpay Webhook] New subscription created:', subscription?.id);
    } else {
      console.log('[Razorpay Webhook] Updating existing subscription:', subscription.id);
      const hasThisPaymentInHistory = Array.isArray(subscription.billingHistory)
        ? subscription.billingHistory.some((entry: Record<string, any>) => entry?.razorpayOrderId === orderId)
        : false;

      console.log('[Razorpay Webhook] Payment already in history:', hasThisPaymentInHistory);

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
      console.log('[Razorpay Webhook] Subscription updated:', subscription?.id);
    }

    console.log('[Razorpay Webhook] Updating user profile for:', userId);
    await userService.update(userId, {
      'subscription.type': planType,
      'subscription.isActive': true,
      'subscription.interval': interval,
      'subscription.startDate': startDate.toISOString(),
      'subscription.endDate': endDate.toISOString(),
    });

    if (rbPointsRedeemed > 0 && paymentData.rbRedemptionStatus !== 'redeemed') {
      await redeemWalletForSubscription({
        userId: String(paymentData.walletUserId || userId),
        amount: rbPointsRedeemed,
        orderId,
        paymentId,
        planType,
        interval,
      });
    }
    if (paymentData.walletUserId) {
      await invalidateUserProfileCache(String(paymentData.walletUserId));
    }

    console.log('[Razorpay Webhook] Finalizing payment record:', orderId);
    await paymentDocRef.update({
      status: 'paid',
      razorpayPaymentId: paymentId || null,
      razorpayPaymentStatus: paymentStatus,
      rbRedemptionStatus: rbPointsRedeemed > 0 ? 'redeemed' : paymentData.rbRedemptionStatus || 'none',
      razorpayWebhookEvent: eventName,
      razorpayWebhookReceivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Send email to the user
    try {
      const userDoc = await adminDb.collection('users').doc(userId).get();
      const userEmail = (userDoc.exists ? userDoc.data()?.email : '') || '';
      if (userEmail) {
        const planName = planType.toUpperCase();
        const startStr = startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const endStr = endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const emailSubject = `Subscription Activated - ABjee Travel`;
        const emailText = `Hello,\n\nThank you for subscribing to our ${planName} plan (${interval})!\n\nYour payment of ₹${finalAmount} has been successfully verified.\n\nSubscription Details:\n- Plan: ${planName}\n- Term: ${interval.toUpperCase()}\n- Start Date: ${startStr}\n- End Date: ${endStr}\n\nEnjoy planning your trips with ABjee Travel!\n\nRegards,\nABjee Travel Team`;
        const emailHtml = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Subscription Activated</h2>
          <p>Hello,</p>
          <p>Thank you for subscribing to our <strong>${planName}</strong> plan (<strong>${interval.toUpperCase()}</strong>)! Your payment has been successfully verified.</p>
          <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; border-radius: 4px;">
            <strong>Subscription Details:</strong><br />
            Plan: ${planName}<br />
            Term: ${interval.toUpperCase()}<br />
            Amount Paid: ₹${finalAmount}<br />
            Start Date: ${startStr}<br />
            End Date: ${endStr}
          </div>
          <p>Enjoy planning your trips and exploring with ABjee Travel!</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">Regards,<br /><strong>ABjee Travel Team</strong></p>
        </div>`;

        await sendEmail({
          to: userEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });
      }
    } catch (mailErr) {
      console.error('[WebhookPayment] Failed to retrieve user or send payment confirmation email:', mailErr);
    }

    console.log('[Razorpay Webhook] SUCCESS: Webhook processed completely');
    console.log('[Razorpay Webhook] Summary:', {
      orderId,
      paymentId,
      userId,
      subscriptionId: subscription?.id,
      planType,
      amount: finalAmount,
      status: 'paid',
    });

    return ok({ message: 'Webhook processed successfully', subscriptionId: subscription?.id || null });
  } catch (error: any) {
    console.error('[Razorpay Webhook] FATAL ERROR:', error?.message);
    console.error('[Razorpay Webhook] Stack:', error?.stack);
    return fail(error?.message || 'Failed to process Razorpay webhook', 500);
  }
}
