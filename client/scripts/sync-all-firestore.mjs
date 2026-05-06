import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { adminDb } from '../src/lib/server/firebaseAdminFirestore.js';
import { SearchService } from '../src/modules/search/SearchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

async function syncAll() {
  console.log('🚀 Starting Full Firestore Search Index Synchronization...');
  
  const COLLECTION = process.env.PLACES_COLLECTION || 'touristPlaces';
  console.log(`📡 Collection: ${COLLECTION}`);
  
  const snapshot = await adminDb.collection(COLLECTION).get();
  console.log(`📝 Found ${snapshot.size} documents to process.`);
  
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    await SearchService.syncPlace({ id: doc.id, ...data });
    count++;
    if (count % 100 === 0) {
      console.log(`✅ Processed ${count}/${snapshot.size}...`);
    }
  }
  
  console.log(`🎉 Successfully synchronized ${count} documents.`);
  process.exit(0);
}

syncAll().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
