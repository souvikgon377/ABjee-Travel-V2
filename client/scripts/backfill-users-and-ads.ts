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
  console.log('🚀 Starting Typesense Users & Advertisements Backfill...\n');
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

    console.log('Users');
    const userSnapshot = await adminDb.collection('users').get();
    const totalUsers = userSnapshot.size;

    if (totalUsers === 0) {
      console.log('   ℹ️  No user documents found');
    } else {
      console.log(`   📝 Found ${totalUsers} users to sync. Processing in batches of ${BATCH_SIZE}...\n`);
      const docs = userSnapshot.docs;
      let count = 0;
      let errors = 0;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

        console.log(`   📦 User Batch ${batchNum}/${totalBatches}:`);

        for (const doc of batch) {
          try {
            const data = doc.data();
            await SyncService.syncUser({
              id: doc.id,
              displayName: data.displayName || data.username || '',
              email: data.email || '',
              role: data.role || 'user',
              status: data.status || 'active',
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              username: data.username || '',
              photoURL: data.photoURL || data.avatar || data.profileImage || '',
              city: data.city || '',
              zipCode: data.zipCode || '',
              country: data.country || '',
              updatedAt: data.updatedAt || data.createdAt,
            });
            count++;
          } catch (err: any) {
            errors++;
            console.error(`      ❌ Failed to sync user ${doc.id}: ${err.message}`);
          }
        }

        const percent = ((count / totalUsers) * 100).toFixed(1);
        const errorRate = errors > 0 ? ` (${errors} errors)` : '';
        console.log(`      ✅ Batch complete: ${count}/${totalUsers} synced (${percent}%)${errorRate}`);

        if (i + BATCH_SIZE < docs.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    console.log('\nAdvertisements');
    const adSnapshot = await adminDb.collection('advertisements').get();
    const totalAds = adSnapshot.size;

    if (totalAds === 0) {
      console.log('   ℹ️  No advertisement documents found');
    } else {
      console.log(`   📝 Found ${totalAds} advertisements to sync. Processing in batches of ${BATCH_SIZE}...\n`);
      const docs = adSnapshot.docs;
      let count = 0;
      let errors = 0;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

        console.log(`   📦 Ad Batch ${batchNum}/${totalBatches}:`);

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
            console.error(`      ❌ Failed to sync advertisement ${doc.id}: ${err.message}`);
          }
        }

        const percent = ((count / totalAds) * 100).toFixed(1);
        const errorRate = errors > 0 ? ` (${errors} errors)` : '';
        console.log(`      ✅ Batch complete: ${count}/${totalAds} synced (${percent}%)${errorRate}`);

        if (i + BATCH_SIZE < docs.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    const duration = ((Date.now() - tStart) / 1000).toFixed(2);
    console.log(`\n✅ Backfill of Users & Advertisements Complete in ${duration}s!`);
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
