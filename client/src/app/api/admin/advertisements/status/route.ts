import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { authenticateRequest, requireAdmin } from '@/lib/server/auth';
import { adminDb, FieldValue } from '@/lib/server/firebaseAdmin';
import { SyncService } from '@/modules/search/SyncService';
import { SearchService } from '@/modules/search/SearchService';
import { sendEmail } from '@/lib/server/mail';

export const runtime = 'nodejs';

/**
 * POST /api/admin/advertisements/status
 * 
 * Admin endpoint to approve or reject an advertisement, record a comment,
 * and notify the owner via email.
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    requireAdmin(currentUser);

    const body = await req.json();
    const { id, status, comment } = body;

    if (!id) {
      return fail('Missing id', 400);
    }
    if (!status || !['approved', 'rejected'].includes(status)) {
      return fail('Invalid or missing status (must be "approved" or "rejected")', 400);
    }

    console.info(`[Admin:Advertisements:Status] Updating ${id} to ${status} with comment: "${comment || ''}"`);

    const docRef = adminDb.collection('advertisements').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return fail('Advertisement not found', 404);
    }

    const data = docSnap.data() || {};
    const ownerEmail = data.ownerEmail || data.email || '';
    const ownerName = data.ownerName || data.name || 'Partner';
    const adName = data.name || 'Your Advertisement';

    const serverTimestamp = FieldValue.serverTimestamp();

    // Prepare updates
    const updates: Record<string, any> = {
      status,
      approvalStatus: status,
      adminComment: comment || '',
      updatedAt: serverTimestamp,
    };

    if (status === 'approved') {
      updates.approvedAt = serverTimestamp;
    }

    // Update Firestore
    await docRef.update(updates);

    // Fetch updated document for sync
    const updatedSnap = await docRef.get();
    const updatedData = { id: updatedSnap.id, ...updatedSnap.data() };

    // Sync to Search (Typesense)
    try {
      await SyncService.syncAdvertisement(updatedData);
      await SearchService.invalidateSearchCache('advertisement-status-update');
    } catch (syncErr) {
      console.warn('[Admin:Advertisements:Status] Typesense sync failed:', syncErr);
    }

    // Send email notification via SMTP if owner email is available
    if (ownerEmail) {
      const isApproved = status === 'approved';
      const subject = isApproved 
        ? `Partner Registration Approved - ABjee Travel`
        : `Partner Registration Rejected - ABjee Travel`;

      const introText = isApproved
        ? `We are pleased to inform you that your advertisement/registration "${adName}" has been approved!`
        : `We regret to inform you that your advertisement/registration "${adName}" has been rejected.`;

      const commentSection = comment
        ? `\nMessage from Admin:\n"${comment}"\n`
        : '';

      const text = `Hello ${ownerName},

${introText}
${commentSection}
Regards,
ABjee Travel Team`;

      const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
        <h2 style="color: ${isApproved ? '#10b981' : '#ef4444'}; margin-top: 0;">Registration Notification</h2>
        <p>Hello <strong>${ownerName}</strong>,</p>
        <p>${introText}</p>
        ${comment ? `<div style="background-color: #f8fafc; border-left: 4px solid ${isApproved ? '#10b981' : '#ef4444'}; padding: 12px; margin: 16px 0; border-radius: 4px;">
          <strong style="display: block; margin-bottom: 4px; color: #475569;">Message from Admin:</strong>
          <span style="font-style: italic; white-space: pre-wrap;">"${comment}"</span>
        </div>` : ''}
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">Regards,<br /><strong>ABjee Travel Team</strong></p>
      </div>`;

      try {
        await sendEmail({
          to: ownerEmail,
          subject,
          text,
          html,
        });
      } catch (mailErr) {
        console.error('[Admin:Advertisements:Status] Failed to send SMTP email:', mailErr);
      }
    } else {
      console.warn('[Admin:Advertisements:Status] No ownerEmail found for document, skipping email.');
    }

    return ok({ message: `Advertisement ${status} successfully.`, id });
  } catch (error: any) {
    console.error('[Admin:Advertisements:Status] Error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
