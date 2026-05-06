import { safeRedisCall } from '@/lib/server/redis';

export class MetricsService {
  private static readonly NS = 'metrics';

  /**
   * Track a numerical metric (increment)
   */
  static async increment(name: string, amount: number = 1) {
    await safeRedisCall(
      (redis) => redis.incrby(`${this.NS}:${name}`, amount),
      null,
      `metrics:inc:${name}`
    );
  }

  /**
   * Track a latency metric (timing)
   */
  static async observeLatency(name: string, ms: number) {
    // Store in a list for P95 calculation or just keep a rolling average
    await safeRedisCall(
      (redis) => redis.lpush(`${this.NS}:latency:${name}`, ms),
      null,
      `metrics:latency:${name}`
    );
    // Trim to keep only last 1000 observations
    await safeRedisCall(
      (redis) => redis.ltrim(`${this.NS}:latency:${name}`, 0, 999),
      null,
      `metrics:trim:${name}`
    );
  }

  /**
   * Track search-specific metrics
   */
  static async trackSearch(latency: number, resultsCount: number, isFallback: boolean) {
    await this.observeLatency('search_latency', latency);
    if (resultsCount === 0) await this.increment('zero_result_count');
    if (isFallback) await this.increment('search_fallback_count');
    await this.increment('search_total_count');
  }

  /**
   * Get metrics summary
   */
  static async getSummary() {
    const metrics = [
      'search_total_count',
      'zero_result_count',
      'search_fallback_count',
      'firestore_reads_count',
      'redis_hit_count',
      'redis_miss_count',
      'admin_write_success',
      'admin_write_fail',
      'typesense_error_count',
      'queue_retry_count',
      'queue_failure_count',
      'search_breaker_open_count'
    ];

    const summary: Record<string, any> = {};

    for (const m of metrics) {
      summary[m] = await safeRedisCall(
        (redis) => redis.get(`${this.NS}:${m}`),
        0,
        `metrics:get:${m}`
      );
    }

    // Calculate Hit Rate
    const hits = Number(summary.redis_hit_count || 0);
    const misses = Number(summary.redis_miss_count || 0);
    summary.redis_hit_rate = hits + misses > 0 ? (hits / (hits + misses) * 100).toFixed(2) + '%' : '0%';

    return summary;
  }
}
