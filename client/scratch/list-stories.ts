import { adminDb } from '../src/lib/server/firebaseAdminFirestore';

async function main() {
  try {
    const snap = await adminDb.collection('stories').orderBy('createdAt', 'desc').limit(5).get();
    console.log('Stories:');
    snap.forEach(doc => {
      console.log(doc.id, doc.data().title, doc.data().authorName);
    });
  } catch (err) {
    console.error('Error listing stories:', err);
  }
}

main();
