import nextEnv from '@next/env';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

const runPrefixCount = async (field, value) => {
  const snap = await db.collection(collection).orderBy(field).startAt(value).endAt(`${value}\uf8ff`).limit(3).get();
  return snap.size;
};

const sampleSnap = await db.collection(collection).limit(500).get();
const candidates = new Set();
for (const doc of sampleSnap.docs) {
  const row = doc.data();
  const locationLower = normalize(row.location_lower || '');
  if (!locationLower) continue;
  const tokens = locationLower.split(' ').filter((t) => t.length >= 3);
  for (const token of tokens) {
    candidates.add(token);
    if (candidates.size >= 300) break;
  }
  if (candidates.size >= 300) break;
}

let found = null;
for (const term of candidates) {
  const nameCount = await runPrefixCount('name_lower', term);
  const locationCount = await runPrefixCount('location_lower', term);
  if (nameCount === 0 && locationCount > 0) {
    found = { term, nameCount, locationCount };
    break;
  }
}

console.log(JSON.stringify({ found, scannedCandidates: candidates.size }, null, 2));
