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

const getArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
};

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
const term = normalize(getArg('--search', 'thailand'));
const limitArg = Number(getArg('--limit', '5'));
const limit = Number.isFinite(limitArg) ? Math.max(1, Math.min(50, Math.floor(limitArg))) : 5;

const runPrefix = async (field, value) => {
  const snap = await db
    .collection(collection)
    .orderBy(field)
    .startAt(value)
    .endAt(`${value}\uf8ff`)
    .limit(limit + 1)
    .get();

  return {
    field,
    docsRead: snap.size,
    docsReturned: Math.min(limit, snap.size),
    ids: snap.docs.slice(0, limit).map((d) => d.id),
  };
};

const byName = await runPrefix('name_lower', term);
let used = byName;

if (byName.docsReturned === 0) {
  const byLocation = await runPrefix('location_lower', term);
  used = {
    queryName: 'fallback:location_lower',
    docsRead: byName.docsRead + byLocation.docsRead,
    docsReturned: byLocation.docsReturned,
    ids: byLocation.ids,
  };
} else {
  used = {
    queryName: 'prefix:name_lower',
    docsRead: byName.docsRead,
    docsReturned: byName.docsReturned,
    ids: byName.ids,
  };
}

console.log(JSON.stringify({ term, limit, ...used }, null, 2));
