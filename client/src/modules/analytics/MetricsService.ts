import { safeRedisCall } from '@/lib/server/redis';

export class MetricsService {
  private static readonly NS = 'metrics';
  private static readonly FLUSH_EVERY_COUNT = 25;
  private static readonly FLUSH_EVERY_MS = 10_000;
  private static readonly LATENCY_SAMPLE_RATE = 0.2;
  private static pendingCounters = new Map<string, number>();
  private static pendingEvents = 0;
  private static lastFlushAt = Date.now();

  private static shouldFlush() {
    return (
      this.pendingEvents >= this.FLUSH_EVERY_COUNT ||
      Date.now() - this.lastFlushAt >= this.FLUSH_EVERY_MS
    );
  }

  private static async flushCounters() {
    if (this.pendingCounters.size === 0) return;

    const counters = Array.from(this.pendingCounters.entries());
    this.pendingCounters.clear();
    this.pendingEvents = 0;
    this.lastFlushAt = Date.now();

    await safeRedisCall(async (redis) => {
      const pipeline = redis.pipeline();
      for (const [name, amount] of counters) {
        pipeline.incrby(`${this.NS}:${name}`, amount);
      }
      await pipeline.exec();
      return null;
    }, null, 'metrics:flush');
  }

  /**
   * Track a numerical metric (increment)
   */
  static async increment(name: string, amount: number = 1) {
    this.pendingCounters.set(name, (this.pendingCounters.get(name) || 0) + amount);
    this.pendingEvents += 1;
    if (this.shouldFlush()) {
      await this.flushCounters();
    }
  }

  /**
   * Track a latency metric (timing)
   */
  static async observeLatency(name: string, ms: number) {
    if (Math.random() > this.LATENCY_SAMPLE_RATE) return;

    // Store in a list for P95 calculation or just keep a rolling average
    await safeRedisCall(async (redis) => {
      const pipeline = redis.pipeline();
      pipeline.lpush(`${this.NS}:latency:${name}`, ms);
      pipeline.ltrim(`${this.NS}:latency:${name}`, 0, 499);
      await pipeline.exec();
      return null;
    }, null, `metrics:latency:${name}`);
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
    await this.flushCounters();

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
