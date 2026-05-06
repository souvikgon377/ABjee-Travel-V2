import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { FirestoreService } from '../database/FirestoreService';
import { SearchService } from '../search/SearchService';
import { CacheService } from '../cache/CacheService';
import { QueueService } from '../queue/QueueService';

export class TouristPlaceService {
  private static COLLECTION = 'touristPlaces';

  /**
   * Get a place by ID with caching
   */
  static async getById(id: string) {
    const cacheKey = `place:${id}`;
    return CacheService.get(cacheKey, async () => {
      const doc = await adminDb.collection(this.COLLECTION).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    }, 3600); // 1 hour Redis TTL
  }

  /**
   * Update a place and trigger sync
   */
  static async update(id: string, data: any) {
    const ref = adminDb.collection(this.COLLECTION).doc(id);
    await ref.update({
      ...data,
      updatedAt: new Date()
    });

    // Invalidate Cache
    await CacheService.invalidate(`place:${id}`);
    await CacheService.invalidatePattern('search:');
    await CacheService.invalidatePattern('places:search:');
    
    // Invalidate Legacy Cache for backward compatibility
    await CacheService.invalidate('prod:tour:places:all');

    // Queue Sync Job
    await QueueService.push({
      type: 'sync_place',
      payload: { id, ...data }
    });

    // Immediate Sync (Best effort)
    await SearchService.syncPlace({ id, ...data });
  }

  /**
   * Create a new place
   */
  static async create(data: any) {
    const ref = await adminDb.collection(this.COLLECTION).add({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    });

    const newPlace = { id: ref.id, ...data };
    
    // Sync to search
    await SearchService.syncPlace(newPlace);
    
    return newPlace;
  }
}
