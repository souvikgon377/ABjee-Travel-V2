import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env before importing any runtime modules that read env vars.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

// Defer importing modules that read process.env until after dotenv has run.
let adminDb: any;
let SyncService: any;
let healthCheckTypesense: (timeoutMs?: number) => Promise<boolean>;

// (dotenv already loaded above)

const BATCH_SIZE = 50; // Process in batches to avoid memory overload

async function backfill() {
  console.log('🚀 Starting Typesense Full Backfill...\n');
  const tStart = Date.now();

  try {
    // Dynamic imports so modules pick up environment variables from `.env`.
    ({ adminDb } = await import('../src/lib/server/firebaseAdminFirestore'));
    ({ SyncService } = await import('../src/modules/search/SyncService'));
    ({ healthCheckTypesense } = await import('../src/modules/search/typesenseClient'));

    // 1. Health check: ensure Typesense is reachable
    console.log('📡 Checking Typesense connectivity...');
    const isHealthy = await healthCheckTypesense(10_000);
    if (!isHealthy) {
      throw new Error(
        'Typesense is not reachable. Ensure it is running before backfilling.'
      );
    }
    console.log('✅ Typesense is healthy\n');

    // 2. Tourist Places
    console.log('🗺️  Tourist Places');
    const PLACES_COL = process.env.PLACES_COLLECTION || 'touristPlaces';
    const totalPlaces = await syncCollectionInBatches(
      PLACES_COL,
      'tourist_places',
      'Places',
      (data, id) => SyncService.syncOnCreate({
        id,
        name: data.name,
        city: data.city || data.area,
        state: data.state,
        country: data.country,
        popularity: data.popularity || 0,
        updatedAt: data.updatedAt,
        category: data.category || 'Other',
        coverImage: data.coverImage,
        googleMapsUrl: data.googleMapsUrl,
        description: data.description,
        media: data.media,
        photos: data.photos,
        videos: data.videos,
        mediaCount: data.mediaCount,
      } as any)
    );

    console.log('\nUsers');
    const totalUsers = await syncCollectionInBatches(
      'users',
      'users',
      'Users',
      (data, id) => SyncService.syncUser({
        id,
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
      })
    );

    console.log('\nTravel Destinations');
    const totalTravelDestinations = await syncCollectionInBatches(
      'travel-destinations',
      'travel_destinations',
      'Travel Destinations',
      (data, id) => SyncService.syncTravelDestination({
        id,
        ...data,
        updatedAt: data.updatedAt || data.createdAt,
      })
    );

    console.log('\nAdvertisements');
    const totalAdvertisements = await syncCollectionInBatches(
      'advertisements',
      'advertisements',
      'Advertisements',
      (data, id) => SyncService.syncAdvertisement({
        id,
        ...data,
        updatedAt: data.updatedAt || data.createdAt,
      })
    );

    console.log('\nAdmin Settings');
    const totalSettings = await syncCollectionInBatches(
      'admin_settings',
      'admin_settings',
      'Admin Settings',
      (data, id) => SyncService.syncSettings({
        id,
        ...data,
        updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
      })
    );

    console.log('\nTrip Stories');
    const totalStories = await syncCollectionInBatches(
      'stories',
      'trip_stories',
      'Trip Stories',
      (data, id) => SyncService.syncTripStory({
        id,
        ...data,
        updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
      })
    );

    const duration = ((Date.now() - tStart) / 1000).toFixed(2);
    console.log(`\n✅ Full Backfill Complete in ${duration}s!`);
    console.log(`📊 Summary:`);
    console.log(`   - Tourist Places: ${totalPlaces} queued for sync`);
    console.log(`   - Users: ${totalUsers} queued for sync`);
    console.log(`   - Travel Destinations: ${totalTravelDestinations} queued for sync`);
    console.log(`   - Advertisements: ${totalAdvertisements} queued for sync`);
    console.log(`   - Admin Settings: ${totalSettings} queued for sync`);
    console.log(`   - Trip Stories: ${totalStories} queued for sync`);
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Start the worker: npm run worker:search-sync`);
    console.log(`   2. Monitor logs for sync progress`);
    console.log(`   3. Verify data in Typesense: curl http://localhost:8108/collections/tourist_places`);

    process.exit(0);
  } catch (err: any) {
    const duration = ((Date.now() - tStart) / 1000).toFixed(2);
    console.error(`\n❌ Backfill failed after ${duration}s:`);
    console.error(`   ${err.message}`);
    console.error(`\n${err.stack}`);
    process.exit(1);
  }
}

/**
 * Fetch and sync a collection in batches to avoid memory overload.
 * @param firestoreCollection - Firestore collection name
 * @param typesenseCollection - Typesense collection name
 * @param label - Display label
 * @param syncFn - Sync function to call for each document
 * @returns Total documents synced
 */
async function syncCollectionInBatches(
  firestoreCollection: string,
  typesenseCollection: string,
  label: string,
  syncFn: (data: any, id: string) => Promise<void>,
): Promise<number> {
  console.log(`   📡 Fetching ${label} from Firestore (${firestoreCollection})...`);

  // Get all documents (will fetch in batches server-side if needed)
  const snapshot = await adminDb.collection(firestoreCollection).get();
  const total = snapshot.size;

  if (total === 0) {
    console.log(`   ℹ️  No documents found in ${firestoreCollection}`);
    return 0;
  }

  console.log(`   📝 Found ${total} items to sync. Processing in batches of ${BATCH_SIZE}...\n`);

  let count = 0;
  let errors = 0;
  const docs = snapshot.docs;

  // Process in batches
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

    console.log(`   📦 Batch ${batchNum}/${totalBatches}:`);

    for (const doc of batch) {
      try {
        await syncFn(doc.data(), doc.id);
        count++;
      } catch (err: any) {
        errors++;
        console.error(`      ❌ Failed to sync ${doc.id}: ${err.message}`);
      }
    }

    const percent = ((count / total) * 100).toFixed(1);
    const errorRate = errors > 0 ? ` (${errors} errors)` : '';
    console.log(`      ✅ Batch complete: ${count}/${total} synced (${percent}%)${errorRate}`);

    // Small delay between batches to avoid overwhelming the queue
    if (i + BATCH_SIZE < docs.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`   🎉 ${label} sync queued: ${count} documents`);
  return count;
}

backfill().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
