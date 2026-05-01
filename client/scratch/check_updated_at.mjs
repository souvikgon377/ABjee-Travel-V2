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

async function checkUpdatedAt() {
  const allSnap = await db.collection(COLLECTION).count().get();
  const allCount = allSnap.data().count;
  
  const updatedSnap = await db.collection(COLLECTION).orderBy('updatedAt').count().get();
  const updatedCount = updatedSnap.data().count;
  
  console.log(`Total records: ${allCount}`);
  console.log(`Records with 'updatedAt' field: ${updatedCount}`);
}

checkUpdatedAt().catch(console.error);
