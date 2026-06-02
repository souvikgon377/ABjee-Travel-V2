import dotenv from 'dotenv';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

const COLLECTION_NAME = 'touristPlaceSearch_v1';

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function getServiceAccount(): ServiceAccountShape | null {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as Partial<ServiceAccountShape>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, '\n'),
      };
    }
  }

  const project_id = process.env.FIREBASE_PROJECT_ID;
  const client_email = process.env.FIREBASE_CLIENT_EMAIL;
  const private_key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return project_id && client_email && private_key ? { project_id, client_email, private_key } : null;
}

function getDb() {
  const serviceAccount = getServiceAccount();
  const app = getApps()[0] || initializeApp(
    serviceAccount
      ? {
          credential: cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key,
          }),
        }
      : undefined
  );

  return getFirestore(app);
}

function serializeFirestoreValue(value: any): any {
  if (!value) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === 'object') {
    const output: Record<string, any> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = serializeFirestoreValue(nestedValue);
    }
    return output;
  }
  return value;
}

async function exportCollection() {
  const adminDb = getDb();
  const snapshot = await adminDb.collection(COLLECTION_NAME).get();
  const rows = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...serializeFirestoreValue(doc.data()),
  }));

  const outputDir = path.join(rootDir, 'exports');
  await fs.mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `${COLLECTION_NAME}-${stamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(rows, null, 2), 'utf8');

  console.log(`Exported ${rows.length} ${COLLECTION_NAME} documents`);
  console.log(outputPath);
}

exportCollection().catch((error) => {
  console.error(`Failed to export ${COLLECTION_NAME}:`, error);
  process.exit(1);
});
