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

async function run() {
  const testUserId = 'test_user_delete_123';
  console.log('--- Setting up test user, subscription, and chatroom entry ---');
  
  // 1. Create a test user doc in Firestore
  await db.collection('users').doc(testUserId).set({
    displayName: 'Test User Delete',
    email: 'testdelete123@tecb.edu.in',
    role: 'user',
    subscription: {
      type: 'pro',
      interval: 'monthly',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    }
  });
  console.log('Created test user in users collection');

  // 2. Create a test subscription doc in Firestore
  const testSubId = 'test_sub_delete_123';
  await db.collection('subscriptions').doc(testSubId).set({
    user: testUserId,
    plan: {
      type: 'pro',
      name: 'Paid Plan',
      price: {
        amount: 105,
        currency: 'INR',
        interval: 'monthly'
      }
    },
    status: 'active',
    startDate: Timestamp.now(),
    endDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
  });
  console.log('Created test subscription in subscriptions collection');

  // 3. Find a chatroom in RTDB to add the user to
  const roomsSnapshot = await rtdb.ref('chatrooms').limitToFirst(1).once('value');
  if (roomsSnapshot.exists()) {
    const roomId = Object.keys(roomsSnapshot.val())[0];
    const room = roomsSnapshot.val()[roomId];
    console.log(`Adding test user to chatroom: ${roomId} (${room.name})`);

    const originalParticipants = Array.isArray(room.participants) ? room.participants : [];
    const originalPendingInvites = Array.isArray(room.pendingInvites) ? room.pendingInvites : [];
    
    // Add user to participants and pendingInvites
    await rtdb.ref(`chatrooms/${roomId}/participants`).set([...originalParticipants, testUserId]);
    await rtdb.ref(`chatrooms/${roomId}/pendingInvites`).set([...originalPendingInvites, testUserId]);
    console.log('Added user to participants & pendingInvites in RTDB');

    // Verify addition
    const addedSnap = await rtdb.ref(`chatrooms/${roomId}`).once('value');
    const addedRoom = addedSnap.val();
    console.log('Room state with test user:', {
      participants: addedRoom.participants,
      pendingInvites: addedRoom.pendingInvites,
    });

    console.log('\n--- Running Deletion and Cleanup Logic ---');

    // Simulating subscription cancellation
    const subSnap = await db.collection('subscriptions').where('user', '==', testUserId).limit(1).get();
    if (!subSnap.empty) {
      const subDoc = subSnap.docs[0];
      await db.collection('subscriptions').doc(subDoc.id).update({
        status: 'cancelled',
        endDate: Timestamp.now(),
        autoRenew: false,
        'cancellation.cancelledAt': Timestamp.now(),
        'cancellation.reason': 'User deleted from admin user management'
      });
      console.log('Subscription document cancelled successfully');
    }

    // Simulating chatroom cleanup
    const allRoomsSnapshot = await rtdb.ref('chatrooms').once('value');
    const allRooms = allRoomsSnapshot.val() || {};
    const updates: Record<string, any> = {};

    for (const rid of Object.keys(allRooms)) {
      const r = allRooms[rid];
      if (r.createdBy === testUserId) {
        updates[`chatrooms/${rid}`] = null;
        continue;
      }
      
      const parts = Array.isArray(r.participants) ? r.participants : [];
      if (parts.includes(testUserId)) {
        updates[`chatrooms/${rid}/participants`] = parts.filter((uid: string) => uid !== testUserId);
      }
      
      const invites = Array.isArray(r.pendingInvites) ? r.pendingInvites : [];
      if (invites.includes(testUserId)) {
        updates[`chatrooms/${rid}/pendingInvites`] = invites.filter((uid: string) => uid !== testUserId);
      }
      
      const reqs = Array.isArray(r.joinRequests) ? r.joinRequests : [];
      if (reqs.includes(testUserId)) {
        updates[`chatrooms/${rid}/joinRequests`] = reqs.filter((uid: string) => uid !== testUserId);
      }
    }

    if (Object.keys(updates).length > 0) {
      await rtdb.ref().update(updates);
      console.log('Updates applied to RTDB successfully');
    }

    // Verify cleanup
    const finalSnap = await rtdb.ref(`chatrooms/${roomId}`).once('value');
    const finalRoom = finalSnap.val();
    console.log('Room state after cleanup:', {
      participants: finalRoom.participants,
      pendingInvites: finalRoom.pendingInvites,
    });

    const finalSubDoc = await db.collection('subscriptions').doc(testSubId).get();
    console.log('Subscription state after cleanup:', finalSubDoc.data());

    // Restore original room participants and pendingInvites
    await rtdb.ref(`chatrooms/${roomId}/participants`).set(originalParticipants);
    await rtdb.ref(`chatrooms/${roomId}/pendingInvites`).set(originalPendingInvites);
    console.log('Restored original room participants & pendingInvites');
  } else {
    console.log('No chatrooms found in RTDB to perform test');
  }

  // 4. Delete test user and test subscription
  await db.collection('users').doc(testUserId).delete();
  await db.collection('subscriptions').doc(testSubId).delete();
  console.log('Cleaned up test documents');
}

run().catch(console.error);
