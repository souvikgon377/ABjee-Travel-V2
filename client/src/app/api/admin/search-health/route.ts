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
    const [version, shardCountStr, lastReason, lastSuccess, locked, history] = await Promise.all([
      redis.get<string>('places:version').catch(() => '0'),
      redis.get<string>('places:min:shards').catch(() => '0'),
      redis.get<string>('rebuild:last_reason').catch(() => 'unknown'),
      redis.get<string>('rebuild:last_success_ts').catch(() => null),
      redis.exists('lock:full_reindex').catch(() => 0),
      redis.lrange('rebuild:history', 0, 9).catch(() => []),
    ]);
    const latency = Date.now() - tStart;
    const shardCount = parseInt(shardCountStr || '0', 10);

    // Confidence scoring
    const { getInMemorySnapshot, getSnapshotVersion } = await import('@/lib/server/sharedPlacesCache');
    const snapshotSize = getInMemorySnapshot().length;
    const snapVersion = getSnapshotVersion();
    const versionDrift = (version && snapVersion) ? Math.abs(Number(version) - Number(snapVersion)) : 0;
    
    const healthy = shardCount > 0 && version !== '0';

    return ok({
      status: healthy ? 'ok' : 'degraded',
      confidence: (healthy && locked === 0 && versionDrift <= 1) ? 'high' : 'degraded',
      mode: 'redis',
      shardCount,
      rebuilding: locked === 1,
      lastRebuildReason: lastReason,
      lastSuccessTs: lastSuccess,
      latency,
      version,
      versionDrift,
      snapshotSize,
      history: history.map((h: string) => {
        try { return JSON.parse(h); } catch { return h; }
      }),
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.error('[SearchHealth] CRITICAL ERROR:', err);
    return ok({ status: 'degraded', cause: 'exception', reason: err.message, mode: 'snapshot', confidence: 'degraded' });
  }
}
