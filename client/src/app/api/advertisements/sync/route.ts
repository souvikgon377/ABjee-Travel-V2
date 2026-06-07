import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/server/http';
import { authenticateRequest } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { SyncService } from '@/modules/search/SyncService';
import { SearchService } from '@/modules/search/SearchService';

export const runtime = 'nodejs';

/**
 * POST /api/advertisements/sync
 * 
 * Synchronizes an advertisement from Firestore to Typesense.
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticateRequest(req);
    if (!currentUser) {
      return fail('Unauthorized', 401);
    }

    const body = await req.json();
    const { id, action } = body;
    if (!id) {
      return fail('Missing id', 400);
    }

    console.info(`[Advertisements:Sync] Requested sync for ID: ${id}, Action: ${action}`);

    const docRef = adminDb.collection('advertisements').doc(id);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = { id: docSnap.id, ...docSnap.data() } as any;
      
      // Authorization check: User must be admin OR the owner of the ad
      const isOwner =
        (currentUser.email && data.ownerEmail && currentUser.email.toLowerCase() === String(data.ownerEmail).toLowerCase()) ||
        (currentUser.email && data.email && currentUser.email.toLowerCase() === String(data.email).toLowerCase()) ||
        (currentUser.uid && data.ownerUid && currentUser.uid === data.ownerUid);

      const isAdmin = currentUser.role === 'admin';

      // General sync/upsert is allowed for any authenticated user (needed for rating/reviews)
      // Delete or other actions still require owner or admin
      if (!isOwner && !isAdmin && action === 'delete') {
        console.warn(`[Advertisements:Sync] Unauthorized attempt to sync delete for ${id} by user ${currentUser.email}`);
        return fail('Unauthorized to delete this advertisement from search index', 403);
      }

      await SyncService.syncAdvertisement(data);
      await SearchService.invalidateSearchCache('advertisement-upsert');
      return ok({ message: 'Advertisement synced successfully', id });
    } else {
      if (action === 'delete') {
        // If the document is already deleted from Firestore, trigger sync delete from Typesense
        await SyncService.delete('advertisements', id);
        await SearchService.invalidateSearchCache('advertisement-delete');
        return ok({ message: 'Advertisement deleted from search index', id });
      }
      return fail('Advertisement not found in Firestore', 404);
    }
  } catch (error: any) {
    console.error('[Advertisements:Sync] Error:', error);
    return fail(error.message || 'Internal Server Error', 500);
  }
}
