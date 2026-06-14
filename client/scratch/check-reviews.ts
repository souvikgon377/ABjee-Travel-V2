import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

async function run() {
  console.log("Fetching touristPlaces...");
  const placesSnap = await db.collection('touristPlaces').get();
  for (const placeDoc of placesSnap.docs) {
    const reviewsSnap = await placeDoc.ref.collection('reviews').orderBy('createdAt', 'desc').limit(5).get();
    if (!reviewsSnap.empty) {
      console.log(`\nPlace: ${placeDoc.id} (${placeDoc.data().name})`);
      for (const doc of reviewsSnap.docs) {
        const data = doc.data();
        console.log(`- Review ID: ${doc.id}`);
        console.log(`  Author: ${data.author}, User ID: ${data.userId}`);
        console.log(`  Rating: ${data.rating}, Text: "${data.text}"`);
        console.log(`  ABJee:`, data.ABJee);
        console.log(`  WalletReward:`, data.walletReward);
        
        if (data.userId && data.userId !== 'anonymous') {
          const userDoc = await db.collection('users').doc(data.userId).get();
          if (userDoc.exists) {
            console.log(`  User Wallet:`, userDoc.data()?.wallet);
          } else {
            console.log(`  User document NOT found for UID: ${data.userId}`);
          }
        }
      }
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
