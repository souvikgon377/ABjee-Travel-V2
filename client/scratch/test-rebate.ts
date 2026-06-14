import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { adminDb } from '../src/lib/server/firebaseAdminFirestore';
import { awardReviewRebate } from '../src/lib/server/rebateWallet';

const db = adminDb;

async function run() {
  const userId = 'kJCCNT8rhzNEY9dmj6Vuvb60Y6p1'; // Souvik Gon
  const placeId = 'Zy1q7lIu8ksAmbOvb4oh'; // Kerala Backwaters
  
  console.log(`Running awardReviewRebate for User: ${userId}, Place: ${placeId}...`);
  
  try {
    const result = await awardReviewRebate({
      userId,
      placeId,
      reviewData: {
        text: "Programmatic test review with text to ensure points are credited.",
        rating: 5,
        media: [],
        author: "Souvik Gon Test",
        userId,
        createdAt: new Date(),
      }
    });
    
    console.log("SUCCESS! Result:", JSON.stringify(result, null, 2));
    
    // Check updated user wallet
    const userDoc = await db.collection('users').doc(userId).get();
    console.log("Updated User Wallet in Firestore:", JSON.stringify(userDoc.data()?.wallet, null, 2));
  } catch (error) {
    console.error("FAILED with error:", error);
  }
  
  process.exit(0);
}

run();
