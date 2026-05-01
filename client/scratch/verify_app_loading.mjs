import nextEnv from '@next/env';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
}

const db = getFirestore();
const COLLECTION = 'touristPlaces';

function normalizeText(text) {
  return String(text || '').trim();
}

const normalizeDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    name: normalizeText(data.name || data.Name || 'Unnamed Place'),
    updatedAt: data.updatedAt
  };
};

async function testLoad() {
  console.log('Fetching from Firestore...');
  const snapshot = await db.collection(COLLECTION).get();
  console.log(`Snapshot size: ${snapshot.size}`);
  
  const places = snapshot.docs.map(normalizeDoc);
  console.log(`Normalized count: ${places.length}`);
  
  if (places.length > 0) {
      console.log('First 5 places:', places.slice(0, 5).map(p => p.name));
  }
}

testLoad().catch(console.error);
