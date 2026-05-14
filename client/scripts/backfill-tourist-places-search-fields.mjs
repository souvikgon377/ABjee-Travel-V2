import nextEnv from '@next/env';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const COLLECTION = process.env.PLACES_COLLECTION || 'touristPlaces';
const BATCH_SIZE = 300;

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const deriveLocationSearch = (data) => {
  const country = data.country || data.Country || '';
  const state = data.state || data.State || '';
  const city = data.city || data.City || '';
  const area = data.area || data.Area || '';

  return normalize([country, state, city, area].filter(Boolean).join(' '));
};

const deriveLocationLower = (data) => {
  const area = data.area || data.Area || '';
  const city = data.city || data.City || '';
  const state = data.state || data.State || '';
  const country = data.country || data.Country || '';

  return normalize([area, city, state, country].filter(Boolean).join(' '));
};

const buildSearchTokens = (...values) => {
  const tokens = new Set();
  const words = normalize(values.filter(Boolean).join(' '))
    .split(' ')
    .filter((word) => word.length >= 2);

  for (const word of words) {
    tokens.add(word);
    const maxPrefixLength = Math.min(word.length, 20);
    for (let i = 2; i <= maxPrefixLength; i += 1) {
      tokens.add(word.slice(0, i));
    }
  }

  return Array.from(tokens).slice(0, 500);
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

async function backfill() {
  let cursor = null;
  let scanned = 0;
  let updated = 0;
  let page = 0;

  while (true) {
    let query = db.collection(COLLECTION).orderBy(FieldPath.documentId()).limit(BATCH_SIZE);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    page += 1;
    scanned += snap.size;

    const batch = db.batch();
    let updatesInBatch = 0;

    for (const doc of snap.docs) {
      const row = doc.data();
      const nextNameLower = normalize(row.name || row.Name || '');
      const nextLocationLower = deriveLocationLower(row);
      const nextLocationSearch = deriveLocationSearch(row);
      const nextSearchTokens = buildSearchTokens(
        row.name || row.Name || '',
        row.area || row.Area || '',
        row.city || row.City || '',
        row.state || row.State || '',
        row.country || row.Country || '',
        row.category || row.Category || '',
      );

      const currentNameLower = row.name_lower || '';
      const currentLocationLower = row.location_lower || '';
      const currentLocationSearch = row.location_search || '';
      const currentSearchTokens = Array.isArray(row.search_tokens) ? row.search_tokens : [];

      if (
        nextNameLower === currentNameLower &&
        nextLocationLower === currentLocationLower &&
        nextLocationSearch === currentLocationSearch &&
        JSON.stringify(nextSearchTokens) === JSON.stringify(currentSearchTokens)
      ) {
        continue;
      }

      batch.update(doc.ref, {
        name_lower: nextNameLower,
        location_lower: nextLocationLower,
        location_search: nextLocationSearch,
        search_tokens: nextSearchTokens,
        updatedAt: row.updatedAt ?? new Date(),
      });
      updatesInBatch += 1;
    }

    if (updatesInBatch > 0) {
      await batch.commit();
      updated += updatesInBatch;
    }

    cursor = snap.docs[snap.docs.length - 1]?.id || null;

    console.log(
      JSON.stringify({
        page,
        pageSize: snap.size,
        updatesInBatch,
        scanned,
        updated,
      }),
    );

    if (snap.size < BATCH_SIZE) break;
  }

  console.log(
    JSON.stringify(
      {
        status: 'done',
        collection: COLLECTION,
        scanned,
        updated,
      },
      null,
      2,
    ),
  );
}

backfill().catch((error) => {
  console.error('[Backfill] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
