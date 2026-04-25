import { ok } from '@/lib/server/http';
import { getRedis } from '@/lib/server/redis';

export const runtime = 'nodejs';

/**
 * Triggers a rebuild with cooldown and backoff protection.
 */
async function triggerSafeRebuild(redis: NonNullable<ReturnType<typeof getRedis>>, reason: string) {
  const lastTs = await redis.get<string>('rebuild:last_ts').catch(() => null);
  const failCount = await redis.get<number>('rebuild:fail_count').catch(() => 0) || 0;
  const backoff = Math.min(60000, failCount * 10000);

  const redisTime = await redis.time().catch(() => [Math.floor(Date.now() / 1000), 0]);
  const nowMs = redisTime[0] * 1000;

  if (lastTs && nowMs - Number(lastTs) < (30000 + backoff)) return;

  const locked = await redis.set('lock:full_reindex', '1', { nx: true, ex: 60 }).catch(() => null);
  if (locked) {
    console.info(`[SearchHealth] Auto-healing trigger (reason: ${reason})`);
    const { refreshCacheInBackground } = await import('@/lib/server/sharedPlacesCache');
    void refreshCacheInBackground(true, reason);
  }
}

/**
 * Admin Search Health Check
 */
export async function GET() {
  try {
    const redis = getRedis();
    if (!redis) {
      return ok({ status: 'degraded', mode: 'snapshot', confidence: 'degraded', reason: 'Redis Offline' });
    }

    const tStart = Date.now();
    const [exists, size, version, indexed, lastReason, lastSuccess, locked, history] = await Promise.all([
      redis.exists('idx:all_tokens'),
      redis.scard('idx:all_ids').catch(() => 0),
      redis.get<number>('places:version').catch(() => 0),
      redis.get<string>('idx:meta:full_indexed').catch(() => 'false'),
      redis.get<string>('rebuild:last_reason').catch(() => 'unknown'),
      redis.get<string>('rebuild:last_success_ts').catch(() => null),
      redis.exists('lock:full_reindex').catch(() => 0),
      redis.lrange('rebuild:history', 0, 9).catch(() => []),
    ]);
    const latency = Date.now() - tStart;

    // Self-healing spot check
    let drift = false;
    if (size > 0) {
      const sample = await redis.srandmember('idx:all_ids').catch(() => null);
      if (sample && !(await redis.exists(`place:${sample}`))) {
        drift = true;
        await triggerSafeRebuild(redis, 'drift_detected');
      }
    }

    // Eviction detection
    if (exists === 0 && indexed === 'true') await triggerSafeRebuild(redis, 'eviction_detected');

    // Missing content alerts
    const hotZero = await (redis as any).zrange('admin:zero_query_patterns', 5, '+inf', { byScore: true, withScores: true }).catch(() => []);
    if (hotZero.length > 0) {
      for (let i = 0; i < hotZero.length; i += 2) {
        console.warn(`[SearchHealth] HOT missing content: "${hotZero[i]}" (hits: ${hotZero[i+1]})`);
      }
    }

    // Confidence scoring
    const { getInMemorySnapshot, getSnapshotVersion } = await import('@/lib/server/sharedPlacesCache');
    const snapshotSize = getInMemorySnapshot().length;
    const snapVersion = getSnapshotVersion();
    const versionDrift = (version && snapVersion) ? Math.abs(Number(version) - Number(snapVersion)) : 0;
    
    const healthy = exists === 1 && size > 0 && !drift && indexed === 'true';

    return ok({
      status: healthy ? 'ok' : drift ? 'healing' : 'degraded',
      confidence: (healthy && locked === 0 && versionDrift <= 1) ? 'high' : 'degraded',
      mode: 'redis',
      size,
      rebuilding: locked === 1,
      lastRebuildReason: lastReason,
      lastSuccessTs: lastSuccess,
      latency,
      version,
      versionDrift,
      snapshotSize,
      history: history.map((h: string) => JSON.parse(h)),
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.error('[SearchHealth] CRITICAL ERROR:', err);
    return ok({ status: 'degraded', cause: 'exception', reason: err.message, mode: 'snapshot', confidence: 'degraded' });
  }
}
