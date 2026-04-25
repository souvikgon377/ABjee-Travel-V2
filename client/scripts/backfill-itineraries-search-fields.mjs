import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Use service account from environment or local file
const serviceAccountPath = join(process.cwd(), 'firebase_service_account_abjee_travel.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const COLLECTION = 'travel-destinations';

const normalize = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function backfill() {
  console.log(`Starting backfill for ${COLLECTION}...`);
  const snapshot = await db.collection(COLLECTION).get();
  console.log(`Found ${snapshot.size} documents.`);

  const batch = db.batch();
  let count = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    
    // Skip if already has fields (optional, but safer to re-run)
    // if (data.location_search && data.location_lower) return;

    const name_lower = normalize(data.place);
    const location_search = normalize([
      data.country,
      data.place,
      ...(Array.isArray(data.places) ? data.places : [])
    ].join(" "));

    const location_lower = normalize([
      data.place,
      ...(Array.isArray(data.places) ? data.places : []),
      data.country
    ].join(" "));

    batch.update(doc.ref, {
      name_lower,
      location_search,
      location_lower,
      updatedAt: new Date(),
    });

    count++;
    if (count % 400 === 0) {
      console.log(`Prepared ${count} updates...`);
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully updated ${count} itineraries.`);
  } else {
    console.log('No updates needed.');
  }
}

backfill().catch(console.error);
