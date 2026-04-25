import nextEnv from '@next/env';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const getServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    };
  }

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
};

const serviceAccount = getServiceAccount();
if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  throw new Error('Missing Firebase Admin credentials.');
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
}

const db = getFirestore();
const collection = process.env.PLACES_COLLECTION || 'touristPlaces';
const pageSize = 500;

let total = 0;
let missingNameLower = 0;
let missingLocationLower = 0;
let inactive = 0;
let cursor = null;

while (true) {
  let q = db.collection(collection).orderBy(FieldPath.documentId()).limit(pageSize);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  if (snap.empty) break;

  for (const doc of snap.docs) {
    total += 1;
    const row = doc.data();

    if (!row.name_lower || String(row.name_lower).trim() === '') {
      missingNameLower += 1;
    }
    if (!row.location_lower || String(row.location_lower).trim() === '') {
      missingLocationLower += 1;
    }
    if (row.isActive === false) {
      inactive += 1;
    }
  }

  cursor = snap.docs[snap.docs.length - 1]?.id || null;
  if (snap.size < pageSize) break;
}

const pct = (value) => (total > 0 ? ((value * 100) / total).toFixed(2) : '0.00');

console.log(
  JSON.stringify(
    {
      collection,
      total,
      missingNameLower,
      missingLocationLower,
      inactive,
      missingNameLowerPct: pct(missingNameLower),
      missingLocationLowerPct: pct(missingLocationLower),
    },
    null,
    2,
  ),
);
