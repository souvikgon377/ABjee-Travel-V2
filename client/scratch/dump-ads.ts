import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

async function run() {
  const { adminDb } = await import('../src/lib/server/firebaseAdminFirestore');
  const snapshot = await adminDb.collection('advertisements').get();
  console.log(`Found ${snapshot.size} advertisements in Firestore:\n`);

  snapshot.docs.forEach((doc) => {
    console.log(`ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log('-'.repeat(40));
  });

  process.exit(0);
}

run().catch(console.error);
