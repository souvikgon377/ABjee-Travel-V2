import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/http';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
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
    const plan = String(body.plan || '').trim().toLowerCase();

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !plan) {
      return fail('Missing verification parameters', 400);
    }

    if (!['monthly', 'quarterly', 'yearly'].includes(plan)) {
      return fail('Invalid plan type', 400);
    }

    const paymentDocRef = adminDb.collection('advertisementPayments').doc(razorpayOrderId);
    const paymentDoc = await paymentDocRef.get();

    if (!paymentDoc.exists) {
      return fail('Order record not found', 404);
    }

    const paymentData = paymentDoc.data() as Record<string, any>;
    if (paymentData.userId !== user.id) {
      return fail('Order does not belong to current user', 403);
    }

    if (paymentData.plan !== plan) {
      return fail('Order plan mismatch', 400);
    }

    if (paymentData.status === 'paid') {
      return ok({
        message: 'Payment already verified',
        plan,
        paymentId: paymentData.razorpayPaymentId || razorpayPaymentId,
      });
    }

    const { keySecret, authHeader } = getRazorpayAuth();

    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return fail('Invalid Razorpay signature signature', 400);
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

    await paymentDocRef.update({
      status: 'paid',
      razorpayPaymentId,
      razorpaySignature,
      razorpayPaymentStatus: paymentStatus,
      verifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      const emailText = `Hello ${recipientName},\n\nThank you for subscribing to our Advertisement ${plan.toUpperCase()} plan!\n\nYour payment has been successfully verified.\n\nSubscription Details:\n- Plan: ${plan.toUpperCase()}\n- Start Date: ${startStr}\n- End Date: ${endStr}\n\nNote: Your subscription validity period will officially start when your advertisement registration is approved by the admin.\n\nRegards,\nABjee Travel Team`;
      const emailHtml = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
        <h2 style="color: #10b981; margin-top: 0;">Subscription Confirmed</h2>
        <p>Hello ${recipientName},</p>
        <p>Thank you for subscribing to our Advertisement <strong>${plan.toUpperCase()}</strong> plan! Your payment has been successfully verified.</p>
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
      message: 'Payment verified successfully',
      plan,
      paymentId: razorpayPaymentId,
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return fail(error.message, error.status);
    }
    return fail(error?.message || 'Failed to verify payment', 500);
  }
}
