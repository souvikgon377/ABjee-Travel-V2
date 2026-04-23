import { getRedis } from './redis';

/**
 * rateLimiter.ts — Shared Redis-based rate limiting for serverless.
 * Prevents API abuse across all Vercel instances.
 */

type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
};

/**
 * checkRateLimit
 * @param identifier Unique key (e.g. user ID, IP)
 * @param limit Max requests allowed in the window
 * @param windowSeconds Duration of the window in seconds
 */
export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number = 60
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    // Fail open if Redis is down (don't block legitimate users)
    return { success: true, limit, remaining: limit, resetSeconds: 0 };
  }

  const key = `ratelimit:${identifier}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

  try {
    const current = await redis.incr(key);
    
    // Set expiry only on first request in window
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, limit - current);
    
    return {
      success: current <= limit,
      limit,
      remaining,
      resetSeconds: windowSeconds,
    };
  } catch (err) {
    console.error(`[RateLimiter] Redis error for "${identifier}":`, err);
    return { success: true, limit, remaining: limit, resetSeconds: 0 };
  }
}

/** 
 * Admin API Policy Helper
 * Defaults to 10 requests / 10 seconds per admin.
 */
export async function checkAdminRateLimit(adminId: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin:${adminId}`, 10, 10);
}
