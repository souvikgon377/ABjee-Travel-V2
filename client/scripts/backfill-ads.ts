import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

let adminDb: any;
let SyncService: any;
let healthCheckTypesense: (timeoutMs?: number) => Promise<boolean>;

const BATCH_SIZE = 50;

async function backfill() {
  console.log('🚀 Starting Typesense Advertisements-only Backfill...\n');
  const tStart = Date.now();

  try {
    ({ adminDb } = await import('../src/lib/server/firebaseAdminFirestore'));
    ({ SyncService } = await import('../src/modules/search/SyncService'));
    ({ healthCheckTypesense } = await import('../src/modules/search/typesenseClient'));

    console.log('📡 Checking Typesense connectivity...');
    const isHealthy = await healthCheckTypesense(10_000);
    if (!isHealthy) {
      throw new Error('Typesense is not reachable. Ensure it is running before backfilling.');
    }
    console.log('✅ Typesense is healthy\n');

    console.log('Advertisements');
    const snapshot = await adminDb.collection('advertisements').get();
    const total = snapshot.size;

    if (total === 0) {
      console.log('   ℹ️  No documents found in advertisements');
      return;
    }

    console.log(`   📝 Found ${total} items to sync. Processing in batches of ${BATCH_SIZE}...\n`);

    let count = 0;
    let errors = 0;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

      console.log(`   📦 Batch ${batchNum}/${totalBatches}:`);

      for (const doc of batch) {
        try {
          const data = doc.data();
          await SyncService.syncAdvertisement({
            id: doc.id,
            ...data,
            updatedAt: data.updatedAt || data.createdAt,
          });
          count++;
        } catch (err: any) {
          errors++;
          console.error(`      ❌ Failed to sync ${doc.id}: ${err.message}`);
        }
      }

      const percent = ((count / total) * 100).toFixed(1);
      const errorRate = errors > 0 ? ` (${errors} errors)` : '';
      console.log(`      ✅ Batch complete: ${count}/${total} synced (${percent}%)${errorRate}`);

      if (i + BATCH_SIZE < docs.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const duration = ((Date.now() - tStart) / 1000).toFixed(2);
    console.log(`\n✅ Advertisements Backfill Complete in ${duration}s!`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ Backfill failed: ${err.message}`);
    process.exit(1);
  }
}

backfill().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
