import { SyncService } from '@/modules/search/SyncService';
import { TypesenseBreaker } from '@/modules/search/typesenseBreaker';
import { CacheInvalidationService } from '@/modules/cache/CacheInvalidationService';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getRedis } from '@/lib/server/redis';

/**
 * RecoveryService - Background recovery and rehydration logic
 * 
 * Handles:
 * - Detecting when Typesense comes back online
 * - Detecting when Redis becomes available
 * - Triggering background re-sync to Typesense
 * - Rehydrating cache gradually
 * - Monitoring service health
 * 
 * Used in:
 * - Background workers/cron jobs
 * - Middleware health checks
 * - Scheduled recovery runs
 */
export class RecoveryService {
  private static readonly HEALTH_CHECK_INTERVAL_MS = 30_000; // 30 seconds
  private static readonly BATCH_SIZE = 100; // Documents per batch during recovery
  private static recoveryInProgress = false;
  private static lastHealthCheckAt = 0;

  /**
   * Check if Typesense is reachable and healthy
   */
  static async isTypesenseHealthy(): Promise<boolean> {
    try {
      const { healthCheckTypesense } = await import('@/modules/search/typesenseClient');
      return await healthCheckTypesense(5000); // 5s timeout for health check
    } catch (error: any) {
      console.error('[RecoveryService] Typesense health check failed:', error?.message);
      return false;
    }
  }

  /**
   * Check if Redis is reachable and healthy
   */
  static async isRedisHealthy(): Promise<boolean> {
    try {
      const redis = getRedis();
      if (!redis) return false;

      // Simple ping test
      await redis.ping();
      return true;
    } catch (error: any) {
      console.warn('[RecoveryService] Redis health check failed:', error?.message);
      return false;
    }
  }

  /**
   * Perform periodic health checks on external services
   * Should be called from a background job or middleware
   */
  static async performHealthChecks(): Promise<void> {
    const now = Date.now();

    // Rate-limit health checks
    if (now - this.lastHealthCheckAt < this.HEALTH_CHECK_INTERVAL_MS) {
      return;
    }

    this.lastHealthCheckAt = now;

    console.log('[RecoveryService] Starting health checks...');

    const [typesenseHealthy, redisHealthy] = await Promise.all([
      this.isTypesenseHealthy(),
      this.isRedisHealthy(),
    ]);

    console.log('[RecoveryService] Health check results:', {
      typesense: typesenseHealthy,
      redis: redisHealthy,
    });

    // If Typesense recovered from circuit breaker, trigger recovery
    if (typesenseHealthy && TypesenseBreaker.getState() === 'OPEN') {
      console.info('[RecoveryService] Typesense recovered! Triggering background sync...');
      void this.recoverTypesense();
    }

    // If Redis is healthy, no action needed (Redis handles reconnection automatically)
    if (redisHealthy) {
      console.info('[RecoveryService] Redis is healthy');
    }
  }

  /**
   * Background sync: Re-sync all documents from Firestore to Typesense
   * Called when Typesense comes back online
   */
  static async recoverTypesense(): Promise<void> {
    if (this.recoveryInProgress) {
      console.warn('[RecoveryService] Recovery already in progress, skipping...');
      return;
    }

    this.recoveryInProgress = true;

    try {
      console.info('[RecoveryService] Starting Typesense recovery...');
      const tStart = Date.now();

      // Get all active places from Firestore
      const snapshot = await adminDb
        .collection('touristPlaces')
        .where('isActive', '==', true)
        .get();

      const totalDocs = snapshot.size;
      console.log('[RecoveryService] Found documents to sync', { total: totalDocs });

      if (totalDocs === 0) {
        console.info('[RecoveryService] No active documents to sync');
        this.recoveryInProgress = false;
        return;
      }

      // Process in batches to avoid memory spike
      const docs = snapshot.docs;
      let synced = 0;
      let failed = 0;

      for (let i = 0; i < docs.length; i += this.BATCH_SIZE) {
        const batch = docs.slice(i, i + this.BATCH_SIZE);

        try {
          await Promise.all(
            batch.map(async (doc) => {
              try {
                const data = {
                  id: doc.id,
                  name: doc.get('name'),
                  city: doc.get('city'),
                  state: doc.get('state'),
                  country: doc.get('country'),
                  popularity: doc.get('popularity'),
                  updatedAt: doc.get('updatedAt'),
                  category: doc.get('category'),
                  coverImage: doc.get('coverImage'),
                };

                await SyncService.syncOnUpdate(data);
                synced++;
              } catch (err) {
                failed++;
                console.error('[RecoveryService] Failed to sync document:', {
                  docId: doc.id,
                  error: err,
                });
              }
            })
          );
        } catch (batchErr) {
          console.error('[RecoveryService] Batch sync failed:', batchErr);
          failed += batch.length;
        }
      }

      const latency = Date.now() - tStart;

      console.info('[RecoveryService] Typesense recovery complete', {
        total: totalDocs,
        synced,
        failed,
        latencyMs: latency,
      });

      // Reset circuit breaker if recovery was successful
      if (failed === 0) {
        TypesenseBreaker.recordSuccess();
      }
    } catch (error) {
      console.error('[RecoveryService] Typesense recovery failed:', error);
      TypesenseBreaker.recordFailure();
    } finally {
      this.recoveryInProgress = false;
    }
  }

  /**
   * Clear and rebuild cache from source
   * Called when cache integrity is suspected to be compromised
   */
  static async rehydrateCache(): Promise<void> {
    console.info('[RecoveryService] Starting cache rehydration...');
    const tStart = Date.now();

    try {
      // 1. Clear all caches
      await CacheInvalidationService.invalidateAll('rehydration');
      console.info('[RecoveryService] Caches cleared');

      // 2. Reload shared places cache (triggers background refresh)
      const { refreshCacheInBackground } = await import('@/lib/server/sharedPlacesCache');
      await refreshCacheInBackground(true, 'recovery_rehydration');

      const latency = Date.now() - tStart;
      console.info('[RecoveryService] Cache rehydration complete', { latencyMs: latency });
    } catch (error) {
      console.error('[RecoveryService] Cache rehydration failed:', error);
      throw error;
    }
  }

  /**
   * Run full recovery cycle:
   * 1. Health checks
   * 2. Rehydrate cache if services are down
   * 3. Recover Typesense if it's back online
   */
  static async runFullRecoveryCycle(): Promise<void> {
    console.info('[RecoveryService] Starting full recovery cycle...');

    try {
      // 1. Perform health checks
      await this.performHealthChecks();

      // 2. Check service status
      const typesenseHealthy = await this.isTypesenseHealthy();
      const redisHealthy = await this.isRedisHealthy();

      if (!typesenseHealthy && !redisHealthy) {
        console.warn('[RecoveryService] Multiple services down, triggering cache rehydration...');
        await this.rehydrateCache();
      } else if (!typesenseHealthy) {
        console.info('[RecoveryService] Typesense is down, cache rehydration will use Redis fallback');
      } else if (!redisHealthy) {
        console.warn('[RecoveryService] Redis is down, using in-memory cache only');
      }

      console.info('[RecoveryService] Full recovery cycle complete');
    } catch (error) {
      console.error('[RecoveryService] Full recovery cycle failed:', error);
    }
  }
}
