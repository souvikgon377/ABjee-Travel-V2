import { db } from '../config/database.js';
import admin from 'firebase-admin';

const auth = admin.auth();
const snapshot = await db.collection('users').get();

console.log('Total Firestore users:', snapshot.size);

const orphanIds = [];

for (const doc of snapshot.docs) {
  const data = doc.data();
  // Check 1: missing firebaseUid field
  if (!data.firebaseUid) {
    console.log(`ORPHAN (no firebaseUid): ${doc.id} | ${data.email}`);
    orphanIds.push(doc.id);
    continue;
  }
  // Check 2: verify Firebase Auth account exists
  try {
    await auth.getUser(doc.id);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log(`ORPHAN (no auth account): ${doc.id} | ${data.email}`);
      orphanIds.push(doc.id);
    }
  }
}

console.log(`\nFound ${orphanIds.length} orphan(s)`);

if (orphanIds.length > 0) {
  const batch = db.batch();
  for (const id of orphanIds) {
    batch.delete(db.collection('users').doc(id));
  }
  await batch.commit();
  console.log('Deleted:', orphanIds);
} else {
  console.log('Nothing to delete');
}
