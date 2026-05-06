import { safeRedisCall } from '@/lib/server/redis';

export class RateLimitService {
  private static readonly PREFIX = 'ratelimit:';

  /**
   * Check if a request should be rate limited
   */
  static async check(ip: string, limit: number = 60, windowSeconds: number = 60): Promise<{
    allowed: boolean;
    remaining: number;
    reset: number;
  }> {
    const key = `${this.PREFIX}${ip}`;
    
    const [count, ttl] = await safeRedisCall(
      async (redis) => {
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.ttl(key);
        return await pipeline.exec() as [number, number];
      },
      [0, -1],
      `ratelimit:check:${ip}`
    );

    if (count === 1) {
      await safeRedisCall(
        (redis) => redis.expire(key, windowSeconds),
        null,
        `ratelimit:expire:${ip}`
      );
    }

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const reset = Date.now() + (ttl > 0 ? ttl : windowSeconds) * 1000;

    return { allowed, remaining, reset };
  }
}
