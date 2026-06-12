import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
  console.log(`Checking status for User ID: ${userId}...`);
  
  // 1. Check Firestore
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (userDoc.exists) {
    console.log('Firestore: User document EXISTS:', userDoc.data());
  } else {
    console.log('Firestore: User document DOES NOT exist');
  }

  // 2. Check Subscription in Firestore
  const subSnapshot = await db.collection('subscriptions').where('user', '==', userId).get();
  if (!subSnapshot.empty) {
    console.log('Firestore: Subscriptions found:');
    subSnapshot.forEach(doc => {
      console.log(`- ID: ${doc.id}, Status: ${doc.data().status}, Data:`, doc.data());
    });
  } else {
    console.log('Firestore: No subscriptions found for user');
  }

  // 3. Check RTDB Chatrooms
  const roomsSnapshot = await rtdb.ref('chatrooms').once('value');
  const rooms = roomsSnapshot.val() || {};
  
  console.log('\nChecking Realtime Database Chatrooms:');
  for (const roomId of Object.keys(rooms)) {
    const room = rooms[roomId];
    const participants = Array.isArray(room.participants) ? room.participants : [];
    const pendingInvites = Array.isArray(room.pendingInvites) ? room.pendingInvites : [];
    const joinRequests = Array.isArray(room.joinRequests) ? room.joinRequests : [];
    
    if (room.createdBy === userId || participants.includes(userId) || pendingInvites.includes(userId) || joinRequests.includes(userId)) {
      console.log(`- Room ID: ${roomId} ("${room.name}"):`);
      console.log(`  * Created By: ${room.createdBy} (Is Match: ${room.createdBy === userId})`);
      console.log(`  * Participants:`, participants);
      console.log(`  * Pending Invites:`, pendingInvites);
      console.log(`  * Join Requests:`, joinRequests);
    }
  }
  
  process.exit(0);
}

run().catch(err => {
  console.error('Error running check script:', err);
  process.exit(1);
});
