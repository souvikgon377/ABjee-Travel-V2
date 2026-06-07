import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, invalidateUserProfileCache } from '@/lib/server/auth';
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
    const startDate = new Date();
    const endDate = getIntervalEndDate(interval, startDate);

    let subscription = await subscriptionService.findByUserId(user.id);
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
      razorpayOrderId,
      razorpayPaymentId,
      promoCode: appliedPromoCode,
      discountPercent,
      discountAmount,
      rbPointsRedeemed,
      rbDiscountAmount,
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
        promoCode: appliedPromoCode,
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
        promoCode: appliedPromoCode,
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

    let walletRedemption = null;
    if (rbPointsRedeemed > 0 && paymentData.rbRedemptionStatus !== 'redeemed') {
      walletRedemption = await redeemWalletForSubscription({
        userId: String(paymentData.walletUserId || user.firebaseUid || user.id),
        amount: rbPointsRedeemed,
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        planType,
        interval,
      });
    }

    // Invalidate auth cache so the new subscription status is reflected immediately
    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }
    if (paymentData.walletUserId && paymentData.walletUserId !== user.firebaseUid) {
      await invalidateUserProfileCache(String(paymentData.walletUserId));
    }

    await paymentDocRef.update({
      status: 'paid',
      razorpayPaymentId,
      razorpaySignature,
      razorpayPaymentStatus: paymentStatus,
      rbRedemptionStatus: rbPointsRedeemed > 0 ? 'redeemed' : paymentData.rbRedemptionStatus || 'none',
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Send email to the user
    const userEmail = user.email || '';
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

      try {
        await sendEmail({
          to: userEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        });
      } catch (mailErr) {
        console.error('[VerifyPayment] Failed to send payment confirmation email:', mailErr);
      }
    }

    return ok({
      message: 'Payment verified and subscription activated',
      subscription,
      wallet: walletRedemption?.wallet || null,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to verify payment', 500);
  }
}
