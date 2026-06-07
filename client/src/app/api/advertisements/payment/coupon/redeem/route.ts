import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { sendEmail } from '@/lib/server/mail';

export const runtime = 'nodejs';

const round2 = (value: number) => Math.round(value * 100) / 100;

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan || '').trim().toLowerCase();
    const promoCode = String(body.promoCode || '').trim().toUpperCase();

    if (!plan || !['monthly', 'quarterly', 'yearly'].includes(plan)) {
      return fail('Invalid plan selection', 400);
    }

    if (!promoCode) {
      return fail('Coupon code is required', 400);
    }

    // Get pricing from settings
    const snapshot = await adminDb.collection('admin_settings').doc('system').get();
    const raw = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : {};
    const pricing = raw.pricing && typeof raw.pricing === 'object' ? (raw.pricing as Record<string, unknown>) : {};

    const currency = typeof pricing.currency === 'string' && pricing.currency.trim() ? pricing.currency.trim().toUpperCase() : 'INR';
    const adMonthly = Number(pricing.adMonthly) || 100;
    const adQuarterly = Number(pricing.adQuarterly) || 250;
    const adYearly = Number(pricing.adYearly) || 800;

    let baseAmount = 0;
    if (plan === 'yearly') {
      baseAmount = adYearly;
    } else if (plan === 'quarterly') {
      baseAmount = adQuarterly;
    } else {
      baseAmount = adMonthly;
    }

    // Get coupon from db
    const couponDoc = await adminDb.collection('coupons').doc(promoCode).get();
    let couponData = couponDoc.exists ? couponDoc.data() : null;

    if (!couponData) {
      const fallbackSnapshot = await adminDb
        .collection('coupons')
        .where('code', '==', promoCode)
        .limit(1)
        .get();

      if (!fallbackSnapshot.empty) {
        couponData = fallbackSnapshot.docs[0].data();
      }
    }

    if (!couponData || couponData.isActive === false) {
      return fail('Invalid or inactive coupon code', 400);
    }

    const now = Date.now();
    const validFrom = typeof couponData.validFrom === 'number' ? couponData.validFrom : null;
    const validUntil = typeof couponData.validUntil === 'number' ? couponData.validUntil : null;

    if (validFrom !== null && now < validFrom) {
      return fail('Coupon is not active yet', 400);
    }

    if (validUntil !== null && now > validUntil) {
      return fail('Coupon is expired', 400);
    }

    const appliesTo = couponData.appliesTo;
    if (appliesTo !== 'partners' && appliesTo !== plan) {
      return fail('Coupon is not valid for this plan', 400);
    }

    const discountPercent = Math.max(0, Math.min(100, round2(Number(couponData.discountPercent || 0))));
    if (discountPercent <= 0) {
      return fail('Coupon discount is not configured correctly', 400);
    }

    const discountAmount = round2((baseAmount * discountPercent) / 100);
    const finalAmount = Math.max(0, round2(baseAmount - discountAmount));

    if (finalAmount > 0) {
      return fail('Coupon does not cover 100% of the payment', 400);
    }

    const orderId = `INV-COUPON-${Date.now()}`;
    const paymentId = `PAY-COUPON-${promoCode}-${Date.now()}`;

    // Create a paid payment record in Firestore
    await adminDb.collection('advertisementPayments').doc(orderId).set({
      orderId,
      userId: user.id,
      plan,
      amount: 0,
      baseAmount,
      discountPercent,
      discountAmount,
      promoCode,
      currency,
      status: 'paid',
      razorpayPaymentId: paymentId,
      paymentGateway: 'coupon',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    });

    const userEmail = user.email || '';
    if (userEmail) {
      const recipientName = (user.firstName || user.displayName || 'Traveler').trim();
      const startStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const expiryDate = new Date();
      if (plan === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      } else if (plan === 'quarterly') {
        expiryDate.setMonth(expiryDate.getMonth() + 3);
      } else {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
      }
      const endStr = expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

      const emailSubject = `Advertisement Subscription Confirmed - ABjee Travel`;
      const emailText = `Hello ${recipientName},\n\nThank you for subscribing to our Advertisement ${plan.toUpperCase()} plan!\n\nYour subscription has been successfully processed using coupon: ${promoCode}.\n\nSubscription Details:\n- Plan: ${plan.toUpperCase()}\n- Start Date: ${startStr}\n- End Date: ${endStr}\n\nNote: Your subscription validity period will officially start when your advertisement registration is approved by the admin.\n\nRegards,\nABjee Travel Team`;
      const emailHtml = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #10b981; margin-top: 0;">Subscription Confirmed</h2>
        <p>Hello ${recipientName},</p>
        <p>Thank you for subscribing to our Advertisement <strong>${plan.toUpperCase()}</strong> plan! Your subscription has been successfully processed using coupon: <strong>${promoCode}</strong>.</p>
        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; border-radius: 4px;">
          <strong>Subscription Details:</strong><br />
          Plan: ${plan.toUpperCase()}<br />
          Start Date: ${startStr}<br />
          End Date: ${endStr}
        </div>
        <p style="font-size: 13px; color: #64748b;">Note: Your subscription validity period will officially start when your advertisement registration is approved by the admin.</p>
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
      message: 'Coupon redeemed successfully',
      plan,
      paymentId,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to redeem coupon', 500);
  }
}
