import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
});

const db = getFirestore(app);
const rtdb = getDatabase(app);
const userId = 'RYuOXa66SQWMYjstS9qKt75eypI3';

async function run() {
  console.log(`Starting cleanup for User ID: ${userId}...`);

  // 1. Cancel subscription in Firestore
  const subSnap = await db.collection('subscriptions').where('user', '==', userId).get();
  if (!subSnap.empty) {
    console.log(`Cancelling active subscription docs (found ${subSnap.size})...`);
    for (const doc of subSnap.docs) {
      await db.collection('subscriptions').doc(doc.id).update({
        status: 'cancelled',
        endDate: Timestamp.now(),
        autoRenew: false,
        'cancellation.cancelledAt': Timestamp.now(),
        'cancellation.reason': 'User deleted from admin user management'
      });
      console.log(`Subscription ${doc.id} cancelled successfully.`);
    }
  } else {
    console.log('No active subscription docs found.');
  }

  // 2. Clean up user from Realtime Database chatrooms
  const roomsSnapshot = await rtdb.ref('chatrooms').once('value');
  const rooms = roomsSnapshot.val() || {};
  const updates: Record<string, any> = {};

  console.log('Scanning Realtime Database chatrooms for cleanup...');
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    if (room.createdBy === userId) {
      updates[`chatrooms/${roomId}`] = null;
      console.log(`Room ${roomId} created by user will be DELETED.`);
      continue;
    }

    const participants = Array.isArray(room.participants) ? room.participants : [];
    if (participants.includes(userId)) {
      updates[`chatrooms/${roomId}/participants`] = participants.filter((uid: string) => uid !== userId);
      console.log(`User will be removed from participants in room ${roomId}.`);
    }

    const pendingInvites = Array.isArray(room.pendingInvites) ? room.pendingInvites : [];
    if (pendingInvites.includes(userId)) {
      updates[`chatrooms/${roomId}/pendingInvites`] = pendingInvites.filter((uid: string) => uid !== userId);
      console.log(`User will be removed from pendingInvites in room ${roomId}.`);
    }

    const joinRequests = Array.isArray(room.joinRequests) ? room.joinRequests : [];
    if (joinRequests.includes(userId)) {
      updates[`chatrooms/${roomId}/joinRequests`] = joinRequests.filter((uid: string) => uid !== userId);
      console.log(`User will be removed from joinRequests in room ${roomId}.`);
    }
  }

  if (Object.keys(updates).length > 0) {
    await rtdb.ref().update(updates);
    console.log('Updates successfully applied to RTDB.');
  } else {
    console.log('No chatroom updates required in RTDB.');
  }

  // 3. Delete user document from Firestore
  await db.collection('users').doc(userId).delete();
  console.log('User document deleted from Firestore users collection.');

  console.log('Cleanup finished successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Error running cleanup script:', err);
  process.exit(1);
});
