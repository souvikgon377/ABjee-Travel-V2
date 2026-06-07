import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError, invalidateUserProfileCache } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
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
import { getCouponPricing } from '@/lib/server/couponPricing';
import { sendEmail } from '@/lib/server/mail';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));

    const planType = body.planType;
    const interval = body.interval;
    const promoCode = String(body.promoCode || '').trim();

    if (!isValidPaidPlan(planType)) {
      return fail('Invalid plan type', 400);
    }

    if (!isValidInterval(interval)) {
      return fail('Invalid billing interval', 400);
    }

    if (!promoCode) {
      return fail('Coupon code is required', 400);
    }

    const [selectedPrice, configuredPlans, privateRoomLimits] = await Promise.all([
      getConfiguredPlanByInterval(planType, interval),
      getConfiguredSubscriptionPlans(),
      getConfiguredPrivateRoomLimits(),
    ]);
    const couponPricing = await getCouponPricing({
      promoCode,
      planType,
      interval,
      baseAmount: selectedPrice.amount,
    });

    if (couponPricing.finalAmount > 0) {
      return fail('Coupon does not fully cover the payable amount', 400);
    }

    const selectedPlan = configuredPlans[planType];
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
      amount: 0,
      currency: selectedPrice.currency,
      status: 'paid',
      description: `${selectedPlan.name} - ${interval} subscription (100% coupon)` ,
      invoiceId: `INV-COUPON-${Date.now()}`,
      paymentDate: new Date().toISOString(),
      paymentGateway: 'coupon',
      promoCode: couponPricing.promoCode,
      discountPercent: couponPricing.discountPercent,
      discountAmount: couponPricing.discountAmount,
      baseAmount: selectedPrice.amount,
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
          type: 'coupon',
          promoCode: couponPricing.promoCode,
        },
        promoCode: couponPricing.promoCode,
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
          type: 'coupon',
          promoCode: couponPricing.promoCode,
        },
        promoCode: couponPricing.promoCode,
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

    if (user.firebaseUid) {
      await invalidateUserProfileCache(user.firebaseUid);
    }

    // Send email to the user
    const userEmail = user.email || '';
    if (userEmail) {
      const recipientName = (user.firstName || user.displayName || 'Traveler').trim();
      const planName = planType.toUpperCase();
      const startStr = startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const endStr = endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const emailSubject = `Subscription Activated - ABjee Travel`;
      const emailText = `Hello ${recipientName},\n\nThank you for subscribing to our ${planName} plan (${interval})!\n\nYour payment has been successfully processed using coupon: ${couponPricing.promoCode}.\n\nSubscription Details:\n- Plan: ${planName}\n- Term: ${interval.toUpperCase()}\n- Amount Paid: ₹0 (100% coupon discount)\n- Start Date: ${startStr}\n- End Date: ${endStr}\n\nEnjoy planning your trips with ABjee Travel!\n\nRegards,\nABjee Travel Team`;
      const emailHtml = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #10b981; margin-top: 0;">Subscription Activated</h2>
        <p>Hello ${recipientName},</p>
        <p>Thank you for subscribing to our <strong>${planName}</strong> plan (<strong>${interval.toUpperCase()}</strong>)! Your payment has been successfully processed using coupon: <strong>${couponPricing.promoCode}</strong>.</p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; border-radius: 4px;">
          <strong>Subscription Details:</strong><br />
          Plan: ${planName}<br />
          Term: ${interval.toUpperCase()}<br />
          Amount Paid: ₹0 (100% coupon discount)<br />
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
        console.error('[CouponRedeem] Failed to send payment confirmation email:', mailErr);
      }
    }

    return ok({
      message: 'Coupon redeemed successfully. Subscription activated.',
      subscription,
      pricing: couponPricing,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to redeem coupon', 500);
  }
}
