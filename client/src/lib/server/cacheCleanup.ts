import { getRedis } from './redis';

const BATCH_SIZE = 100;

/**
 * Purges old versioned cache keys from Redis.
 * Uses SCAN to avoid blocking the event loop.
 * @param currentVersion The version to KEEP. All lower versions will be purged.
 */
export async function purgeOldCacheVersions(currentVersion: number) {
  const redis = getRedis();
  if (!redis) return;

  console.info(`[Cache/Cleanup] Starting purge for versions < ${currentVersion}`);
  
  let cursor = "0";
  let totalPurged = 0;

  try {
    do {
      // Scan for any places cache keys
      const [nextCursor, keys] = await redis.scan(cursor, { 
        match: 'places:v*', 
        count: BATCH_SIZE 
      });
      
      cursor = nextCursor;
      
      const keysToDelete: string[] = [];
      
      for (const key of keys) {
        // Pattern: places:v{version}_{meta}:...
        const match = key.match(/^places:v(\d+)/);
        if (match) {
          const version = parseInt(match[1], 10);
          if (version < currentVersion) {
            keysToDelete.push(key);
          }
        }
      }

      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete).catch(() => null);
        totalPurged += keysToDelete.length;
        console.info(`[Cache/Cleanup] Purged ${keysToDelete.length} keys...`);
      }

    } while (cursor !== "0");

    console.info(`[Cache/Cleanup] Purge complete. Total keys removed: ${totalPurged}`);
  } catch (error) {
    console.error('[Cache/Cleanup] Error during purge:', error);
  }
}
