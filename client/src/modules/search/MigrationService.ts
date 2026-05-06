import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { SearchService } from './SearchService';

export class MigrationService {
  private static SOURCE_COLLECTION = 'touristPlaces';
  private static BATCH_SIZE = 100;

  /**
   * Migrates all data from touristPlaces to touristPlaceSearch
   */
  static async migrateAll() {
    console.log('🚀 Starting migration to touristPlaceSearch...');
    let processed = 0;
    let lastDoc: any = null;

    while (true) {
      let query = adminDb.collection(this.SOURCE_COLLECTION)
        .orderBy('__name__')
        .limit(this.BATCH_SIZE);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const promises = snapshot.docs.map(async (doc: any) => {
        const data = doc.data();
        await SearchService.syncPlace({
          id: doc.id,
          ...data
        });
      });

      await Promise.all(promises);
      
      processed += snapshot.size;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      
      console.log(`✅ Processed ${processed} documents...`);

      if (snapshot.size < this.BATCH_SIZE) break;
    }

    console.log('✨ Migration completed successfully!');
    return processed;
  }
}
