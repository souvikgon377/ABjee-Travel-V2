import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

async function run() {
  // Dynamic imports so they resolve after dotenv.config()
  const { adminDb } = await import('../src/lib/server/firebaseAdminFirestore');
  const { SyncService } = await import('../src/modules/search/SyncService');
  const { healthCheckTypesense } = await import('../src/modules/search/typesenseClient');

  console.log('📡 Checking Typesense connectivity...');
  const isHealthy = await healthCheckTypesense(10_000);
  if (!isHealthy) {
    throw new Error('Typesense is not reachable.');
  }
  console.log('✅ Typesense is healthy\n');

  console.log('📡 Fetching advertisements from Firestore...');
  const snapshot = await adminDb.collection('advertisements').get();
  console.log(`📝 Found ${snapshot.size} advertisements to sync...`);

  let count = 0;
  for (const doc of snapshot.docs) {
    try {
      const data = { id: doc.id, ...doc.data() };
      await SyncService.syncAdvertisement(data);
      count++;
      console.log(`   ✅ Synced advertisement ${doc.id}`);
    } catch (e: any) {
      console.error(`   ❌ Failed to sync ${doc.id}:`, e.message);
    }
  }

  console.log(`\n🎉 Backfill completed. Synced ${count} advertisements.`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
