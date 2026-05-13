import { CacheService } from '@/modules/cache/CacheService';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { SyncService } from '@/modules/search/SyncService';

export enum InvalidationScope {
  SEARCH = 'search',
  PLACE = 'place',
  ALL = 'all',
}

export enum MutationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

/**
 * CacheInvalidationService - Centralized cache invalidation logic
 * 
 * Handles:
 * - Search cache invalidation (prefix-based)
 * - Individual place cache invalidation
 * - Full cache clearing (on recovery)
 * - Syncing changes to Typesense
 * 
 * Uses smart invalidation patterns:
 * - invalidatePattern('search:') clears all search caches
 * - invalidate(`place:${id}`) clears specific place
 * - Combines L1 (GlobalCache) + L2 (Redis) invalidation
 */
export class CacheInvalidationService {
  /**
   * Invalidate all search-related caches
   * Called when ANY place is created/updated/deleted
   */
  static async invalidateSearch(reason: string = 'mutation'): Promise<void> {
    console.log('[CacheInvalidation] Invalidating search caches', { reason });

    // L1 cache
    GlobalCache.invalidatePattern('search:');
    GlobalCache.invalidatePattern('places:search:');
    GlobalCache.invalidatePattern('api:places:all:');

    // L2 cache (Redis)
    await CacheService.invalidatePrefix('search:');
    await CacheService.invalidatePrefix('places:search:');
    await CacheService.invalidatePrefix('api:places:all:');
  }

  /**
   * Invalidate a specific place cache
   * Called when a place is deleted
   */
  static async invalidatePlace(placeId: string, reason: string = 'mutation'): Promise<void> {
    const key = `place:${placeId}`;
    console.log('[CacheInvalidation] Invalidating place cache', { placeId, reason });

    // L1 cache
    GlobalCache.delete(key);

    // L2 cache (Redis)
    await CacheService.invalidate(key);
  }

  /**
   * Invalidate the shared places snapshot
   * Called when any place changes to refresh fallback data
   */
  static async invalidateSharedSnapshot(reason: string = 'mutation'): Promise<void> {
    console.log('[CacheInvalidation] Invalidating shared snapshot', { reason });

    const keys = [
      'prod:tour:places:all',
      'prod:tour:places:version',
      'api:places:all',
    ];

    for (const key of keys) {
      GlobalCache.delete(key);
      await CacheService.invalidate(key);
    }
  }

  /**
   * Full cache invalidation (emergency clear)
   * Called during recovery or when complete cache refresh is needed
   */
  static async invalidateAll(reason: string = 'recovery'): Promise<void> {
    console.log('[CacheInvalidation] Clearing ALL caches', { reason });

    // L1 cache
    GlobalCache.clear();

    // L2 cache (Redis) - clear all keys
    // This is handled by CacheService
    // Note: We don't have a direct "clear all" in Redis, so we invalidate known patterns
    await CacheService.invalidatePrefix('search:');
    await CacheService.invalidatePrefix('places:');
    await CacheService.invalidatePrefix('place:');
    await CacheService.invalidatePrefix('api:');
    await CacheService.invalidatePrefix('prod:tour:');
  }

  /**
   * Coordinated invalidation after mutation
   * Invalidates search + shared snapshot + triggers Typesense sync
   */
  static async onMutation(
    placeData: any,
    mutationType: MutationType,
    reason: string = 'mutation'
  ): Promise<void> {
    console.log('[CacheInvalidation] Processing mutation', {
      placeId: placeData.id,
      type: mutationType,
      reason,
    });

    // 1. Invalidate all search caches (highest priority)
    await this.invalidateSearch(`mutation:${mutationType}`);

    // 2. Invalidate shared snapshot
    await this.invalidateSharedSnapshot(`mutation:${mutationType}`);

    // 3. For DELETE, also invalidate the specific place cache
    if (mutationType === MutationType.DELETE) {
      await this.invalidatePlace(placeData.id, `mutation:${mutationType}`);
    }

    // 4. Trigger Typesense sync asynchronously (don't wait)
    if (mutationType === MutationType.CREATE) {
      void SyncService.syncOnCreate(placeData);
    } else if (mutationType === MutationType.UPDATE) {
      void SyncService.syncOnUpdate(placeData);
    } else if (mutationType === MutationType.DELETE) {
      void SyncService.syncOnDelete(placeData.id);
    }

    console.log('[CacheInvalidation] Mutation invalidation complete', {
      placeId: placeData.id,
      type: mutationType,
    });
  }

  /**
   * Smart cache update (not just delete)
   * Updates existing cache entries when possible
   */
  static async smartUpdate(
    placeId: string,
    placeData: any,
    mutationType: MutationType
  ): Promise<void> {
    console.log('[CacheInvalidation] Smart cache update', {
      placeId,
      type: mutationType,
    });

    // Try to update the shared snapshot incrementally
    try {
      const { updateSharedPlaceInCache } = await import('@/lib/server/sharedPlacesCache');
      await updateSharedPlaceInCache(placeData, mutationType);
      console.log('[CacheInvalidation] Smart cache update succeeded', { placeId });
    } catch (error) {
      console.warn('[CacheInvalidation] Smart cache update failed, falling back to full invalidation', {
        placeId,
        error,
      });
      await this.onMutation(placeData, mutationType, 'fallback');
    }
  }
}
